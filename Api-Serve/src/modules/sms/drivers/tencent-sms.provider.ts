import { Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { SMS_DRIVER_LABELS, SmsDriver } from '../constants/sms-driver.constant';
import type { EffectiveSmsConfig } from '../models/sms-config.model';
import type { SmsProvider } from '../sms-provider.interface';

const API_VERSION = '2021-01-11';
const SERVICE = 'sms';
const ALGORITHM = 'TC3-HMAC-SHA256';
const CONTENT_TYPE = 'application/json; charset=utf-8';
const REQUEST_TIMEOUT_MS = 5000;

/**
 * 腾讯云短信（sms.tencentcloudapi.com，API 3.0）。
 *
 * TC3-HMAC-SHA256 签名自己实现，不引 `tencentcloud-sdk-nodejs`：
 * 与阿里云那次同一判断 —— 为一个签名算法拖进整套 SDK 与其传递依赖不划算。
 *
 * 签名是**两次派生密钥**，不是直接拿 SecretKey 签：
 * 1. 规范请求串 = POST / 空查询串 / 只签 content-type 与 host 两个头 / 请求体的 SHA256；
 * 2. 待签名串 = 算法 + 时间戳 + `日期/sms/tc3_request` + 规范请求串的 SHA256；
 * 3. 密钥链 `TC3+SecretKey → 日期 → sms → tc3_request`，逐层 HMAC-SHA256，最后签出来的 hex 才是 Signature。
 * 少派生一层、或者把 X-TC-* 头也签进去，都会回 `AuthFailure.SignatureFailure`。
 */
@Injectable()
export class TencentSmsProvider implements SmsProvider {
  readonly driver = SmsDriver.Tencent;
  readonly label = SMS_DRIVER_LABELS[SmsDriver.Tencent];

  private readonly logger = new Logger(TencentSmsProvider.name);

  isReady(config: EffectiveSmsConfig): boolean {
    return Boolean(
      config.accessKeyId &&
        config.accessKeySecret &&
        config.sdkAppId &&
        config.signName &&
        config.templateCode,
    );
  }

  /**
   * 腾讯云的模板变量是**按位置**的（`您的验证码为{1}`），不像阿里云按变量名，
   * 所以这里只传一个元素的数组，模板里必须只留一个变量位。
   */
  async send(config: EffectiveSmsConfig, phone: string, code: string): Promise<void> {
    const body = await this.call(config, 'SendSms', {
      SmsSdkAppId: config.sdkAppId,
      SignName: config.signName,
      TemplateId: config.templateCode,
      PhoneNumberSet: [toE164(phone)],
      TemplateParamSet: [code],
    });

    const response = pickResponse(body);
    const gatewayError = readError(body);
    if (gatewayError) {
      throw new BusinessException(
        translate(gatewayError.code, gatewayError.message),
        502,
      );
    }

    const status = (response.SendStatusSet as unknown[] | undefined)?.[0] as
      | { Code?: string; Message?: string }
      | undefined;
    if (!status) {
      this.logger.warn('腾讯云短信返回结果里没有 SendStatusSet，按失败处理');
      throw new BusinessException('短信服务返回结果无法识别，请稍后重试或联系平台运营', 502);
    }
    const code0 = String(status.Code ?? '');
    if (code0.toUpperCase() === 'OK') {
      return;
    }
    this.logger.warn(`腾讯云短信发送失败 Code=${code0} Message=${String(status.Message ?? '')}`);
    throw new BusinessException(translate(code0, String(status.Message ?? '')), 502);
  }

  /**
   * 自检用 DescribeSmsTemplateList：免费、不占发送额度，
   * 一次验掉「SecretId/SecretKey 对不对」「模板 ID 在不在这个账号下」「模板审核过了没有」。
   */
  async probe(config: EffectiveSmsConfig): Promise<{ ok: boolean; message: string }> {
    if (!this.isReady(config)) {
      return { ok: false, message: '腾讯云短信凭据不全，请先补齐 SecretId、SecretKey、SdkAppId、签名与模板 ID' };
    }

    const body = await this.call(config, 'DescribeSmsTemplateList', { International: 0 });
    const response = pickResponse(body);
    const gatewayError = readError(body);
    if (gatewayError) {
      return { ok: false, message: translate(gatewayError.code, gatewayError.message) };
    }

    const templates = ((response.TemplateList as unknown[] | undefined) ?? []) as {
      SmsTemplateId?: number | string;
      InvestigateStatus?: number;
      SmsTemplateContent?: string;
    }[];

    const wanted = config.templateCode.trim();
    const hit = templates.find((item) => String(item.SmsTemplateId ?? '') === wanted);
    if (!hit) {
      return {
        ok: false,
        message: `凭据可用，但该账号下查不到模板 ID ${wanted}（模板要在腾讯云短信控制台「正文模板管理」里创建并审核通过；若确实存在，则该 SecretId 可能没有读取模板的权限）`,
      };
    }

    const variables = countVariables(hit.SmsTemplateContent);
    if (variables > 1) {
      return {
        ok: false,
        message: `模板 ID ${wanted} 有 ${variables} 个变量位，但验证码只传一个变量，发送会被拒；请换成只有一个变量位的验证码模板`,
      };
    }

    const status = Number(hit.InvestigateStatus ?? -1);
    const label = INVESTIGATE_STATUS_LABELS[status] ?? `未知状态（${status}）`;
    return {
      ok: status === 1,
      message:
        status === 1
          ? `凭据可用，模板 ID ${wanted} 审核通过${variables === 0 ? '（注意：该模板里没有变量位，收不到验证码）' : ''}`
          : `模板 ID ${wanted} 当前状态：${label}`,
    };
  }

  /** 组规范请求串 → 派生密钥 → 带上 X-TC-* 头提交；返回解析后的 JSON。 */
  private async call(
    config: EffectiveSmsConfig,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const root = gatewayRoot(config.endpoint);
    const host = new URL(root).host;
    const text = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const credentialScope = `${date}/${SERVICE}/tc3_request`;

    const canonicalRequest = [
      'POST',
      '/',
      '',
      `content-type:${CONTENT_TYPE}\nhost:${host}\n`,
      'content-type;host',
      sha256Hex(text),
    ].join('\n');

    const stringToSign = [
      ALGORITHM,
      String(timestamp),
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const signature =
      hmacHex(hmac(hmac(hmac(`TC3${config.accessKeySecret}`, date), SERVICE), 'tc3_request'), stringToSign);

    let response: globalThis.Response;
    try {
      response = await fetch(`${root}/`, {
        method: 'POST',
        headers: {
          'Content-Type': CONTENT_TYPE,
          Host: host,
          'X-TC-Action': action,
          'X-TC-Version': API_VERSION,
          'X-TC-Timestamp': String(timestamp),
          'X-TC-Region': config.region,
          Authorization: `${ALGORITHM} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`,
        },
        body: text,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`腾讯云短信请求失败 Action=${action}: ${message}`);
      throw new BusinessException('短信服务暂时不可用，请稍后重试', 502);
    }

    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { ...(body ?? {}), __status: response.status };
  }
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function hmacHex(key: Buffer, data: string): string {
  return createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

/** 网关地址容错：填了带路径或带斜杠的也不至于拼出 `//`。 */
function gatewayRoot(endpoint: string): string {
  const trimmed = (endpoint || '').trim().replace(/\/+$/, '');
  try {
    const url = new URL(trimmed || 'https://sms.tencentcloudapi.com');
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('protocol');
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    throw new BusinessException('短信网关地址不是合法 URL，请在「短信配置」里改回官方地址或填写完整地址', 502);
  }
}

function pickResponse(body: Record<string, unknown>): Record<string, unknown> {
  const response = body?.Response;
  return typeof response === 'object' && response !== null
    ? (response as Record<string, unknown>)
    : {};
}

function readError(
  body: Record<string, unknown>,
): { code: string; message: string } | null {
  const error = pickResponse(body).Error as { Code?: string; Message?: string } | undefined;
  if (error) {
    return { code: String(error.Code ?? ''), message: String(error.Message ?? '') };
  }
  // 网关前面挂了代理时可能只给 HTTP 状态码、没有 Response.Error，这种情况也要说清是哪一步挂了
  const status = Number(body.__status ?? 200);
  if (status >= 400) {
    return { code: `HTTP_${status}`, message: '' };
  }
  return null;
}

/** 腾讯云模板变量写作 {1} {2}，数一下有几个变量位。 */
function countVariables(content: string | undefined): number {
  const matches = String(content ?? '').match(/\{\d+\}/g);
  return matches ? new Set(matches).size : 0;
}

/**
 * 国内号码补 +86：腾讯云要求 E.164，缺国家码会直接回 `FailedOperation.PhoneNumberInvalid`，
 * 而这个错误看起来像「顾客手机号填错了」，实际是我们少拼了前缀。
 */
function toE164(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.startsWith('86') && digits.length > 11) {
    return `+${digits}`;
  }
  return `+86${digits}`;
}

function translate(code: string, rawMessage: string): string {
  const hit = TENCENT_SMS_MESSAGES[code];
  if (hit) {
    return hit;
  }
  return `短信服务返回错误（${code}${rawMessage ? ` ${rawMessage}` : ''}），请联系平台运营核对短信配置`;
}

/**
 * 常见错误码。SecretId/签名/模板那几条是接真机时最先撞上的，
 * 提示里要指名是「平台侧配置」而不是让顾客反复重试。
 */
const TENCENT_SMS_MESSAGES: Record<string, string> = {
  'AuthFailure.SecretIdNotFound': '短信 SecretId 不存在，请联系平台运营核对配置',
  'AuthFailure.SignatureFailure': '短信签名校验失败，请核对 SecretKey 是否填错',
  'AuthFailure.RequestNotAllowed': '该 SecretId 无权调用短信接口，请在腾讯云 CAM 授权 QcloudSmsFullAccess',
  'FailedOperation.SignatureIncorrectOrUnapproved': '短信签名未通过审核，请联系平台运营核对短信配置',
  'FailedOperation.TemplateReviewNoPassed': '短信模板未通过审核，请联系平台运营核对短信配置',
  'FailedOperation.TemplateAndSignNotMatch': '短信模板与签名不属于同一类型，请在腾讯云控制台确认可用模板',
  'FailedOperation.SmsAppIdError': '短信应用 SdkAppId 不正确，请在腾讯云短信控制台「应用管理」核对',
  'FailedOperation.InsufficientBalance': '短信账户余额不足，请联系平台运营充值',
  'FailedOperation.PhoneNumberInvalid': '手机号格式不正确，请检查后重试',
  'FailedOperation.PhoneNumberInBlacklist': '该号码被运营商列入短信黑名单，请稍后再试或改用微信一键登录',
  'FailedOperation.DayLimitControl': '今日短信发送次数已达上限，请明天再试',
  'FailedOperation.FrequencyLimit': '发送过于频繁，请稍后再试',
  'FailedOperation.TemplateParameterNumberInvalid': '模板变量个数与配置不符：验证码模板只能留一个变量位',
  InvalidParameterValue: '短信参数不合法（多为模板变量或 SdkAppId 不匹配），请联系平台运营核对短信配置',
  MissingParameter: '短信请求缺少必填参数，请联系平台运营核对短信配置',
  RequestLimitExceeded: '短信接口被限流，请稍后重试',
  InternalError: '短信服务内部错误，请稍后重试',
  HTTP_403: '短信接口鉴权被拒（403），请确认 SecretId 有 SMS 权限',
};

const INVESTIGATE_STATUS_LABELS: Record<number, string> = {
  0: '审核中',
  1: '审核成功',
  2: '审核失败',
};
