import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { BusinessException } from '../../../common/exceptions/business.exception';
import {
  SMS_DRIVER_LABELS,
  SMS_DRIVER_REQUIRED_FIELDS,
  SmsDriver,
  smsFieldLabel,
} from '../constants/sms-driver.constant';
import type { EffectiveSmsConfig } from '../models/sms-config.model';
import type { SmsProvider } from '../sms-provider.interface';

const API_VERSION = '2017-05-25';
const REQUEST_TIMEOUT_MS = 5000;

/**
 * 阿里云短信（Dysmsapi）。
 *
 * 签名按官方 RPC 规范自己实现，不引 `@alicloud/dysmsapi20170525`：
 * 与对象存储那次同一判断 —— 为一个签名算法拖进整套 SDK 与其传递依赖不划算。
 *
 * 规范三步，顺序错了就报 SignatureDoesNotMatch：
 * 1. 公共参数 + 业务参数按 key 排序，逐个 percentEncode 拼成 query；
 * 2. `POST&%2F&` + percentEncode(上一步的 query) 作为待签名串；
 * 3. HMAC-SHA1，密钥是 `AccessKeySecret + "&"`，结果 base64 后再 percentEncode 附上。
 */
@Injectable()
export class AliyunSmsProvider implements SmsProvider {
  readonly driver = SmsDriver.Aliyun;
  readonly label = SMS_DRIVER_LABELS[SmsDriver.Aliyun];

  private readonly logger = new Logger(AliyunSmsProvider.name);

  isReady(config: EffectiveSmsConfig): boolean {
    return missingAliyunFields(config).length === 0;
  }

  async send(config: EffectiveSmsConfig, phone: string, code: string): Promise<void> {
    const body = await this.call(config, 'SendSms', {
      PhoneNumbers: phone,
      SignName: config.signName,
      TemplateCode: config.templateCode,
      // 模板变量名固定是 code：云厂商那边变量名不一致会直接被拒，改这里要同步改模板
      TemplateParam: JSON.stringify({ code }),
    });

    const aliyunCode = String(body.Code ?? `HTTP_${body.__status}`);
    if (aliyunCode === 'OK') {
      return;
    }
    this.logger.warn(`阿里云短信发送失败 Code=${aliyunCode} Message=${String(body.Message ?? '')}`);
    throw new BusinessException(translate(aliyunCode, String(body.Message ?? '')), 502);
  }

  /**
   * 自检用 QuerySmsSign：免费、不占发送额度，能一次验掉
   * 「AccessKey 对不对」和「签名审核过了没有」这两件最常卡住的事。
   */
  async probe(config: EffectiveSmsConfig): Promise<{ ok: boolean; message: string }> {
    const missing = missingAliyunFields(config);
    if (missing.length > 0) {
      return { ok: false, message: `缺少必填配置：${missing.join('、')}` };
    }

    const body = await this.call(config, 'QuerySmsSign', { SignName: config.signName });
    const aliyunCode = String(body.Code ?? `HTTP_${body.__status}`);
    if (aliyunCode !== 'OK') {
      return { ok: false, message: translate(aliyunCode, String(body.Message ?? '')) };
    }

    const status = Number((body.Data as { SignStatus?: number } | undefined)?.SignStatus ?? -1);
    const label = SIGN_STATUS_LABELS[status] ?? `未知状态（${status}）`;
    return {
      ok: status === 1,
      message:
        status === 1
          ? `凭据可用，签名「${config.signName}」审核通过`
          : `签名「${config.signName}」当前状态：${label}`,
    };
  }

  /** 公共参数 + 签名 + 表单提交；返回解析后的 JSON，附带 HTTP 状态码供上层判断。 */
  private async call(
    config: EffectiveSmsConfig,
    action: string,
    business: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const params: Record<string, string> = {
      AccessKeyId: config.accessKeyId,
      Action: action,
      Format: 'JSON',
      RegionId: config.region,
      SignatureMethod: 'HMAC-SHA1',
      SignatureNonce: randomUUID(),
      SignatureVersion: '1.0',
      Timestamp: isoTimestamp(new Date()),
      Version: API_VERSION,
      ...business,
    };

    const query = canonicalizedQuery(params);
    const stringToSign = `POST&${percentEncode('/')}&${percentEncode(query)}`;
    const signature = createHmac('sha1', `${config.accessKeySecret}&`)
      .update(stringToSign)
      .digest('base64');

    let response: globalThis.Response;
    try {
      response = await fetch(`${config.endpoint.replace(/\/+$/, '')}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `${query}&Signature=${percentEncode(signature)}`,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`阿里云短信请求失败 Action=${action}: ${message}`);
      throw new BusinessException('短信服务暂时不可用，请稍后重试', 502);
    }

    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { ...(body ?? {}), __status: response.status };
  }
}

/** 阿里云要求的 RFC3986 变体：`+` `*` `~` 三个字符与标准 encodeURIComponent 不同。 */
function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

/** 缺哪些必填项，按阿里云控制台原文措辞返回，界面与自检提示共用。 */
function missingAliyunFields(config: EffectiveSmsConfig): string[] {
  return SMS_DRIVER_REQUIRED_FIELDS[SmsDriver.Aliyun]
    .filter((field) => !String(config[field] ?? '').trim().length)
    .map((field) => smsFieldLabel(SmsDriver.Aliyun, field));
}

function canonicalizedQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&');
}

/** Timestamp 必须是 UTC 且精确到秒：`2026-10-03T09:12:34Z`。 */
function isoTimestamp(now: Date): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function translate(code: string, rawMessage: string): string {
  const hit = ALIYUN_SMS_MESSAGES[code];
  if (hit) {
    return hit;
  }
  return `短信服务返回错误（${code}${rawMessage ? ` ${rawMessage}` : ''}），请联系平台运营核对短信配置`;
}

/**
 * 常见错误码。签名/模板那几条是接真机时最先撞上的，
 * 提示里要指名是「平台侧配置」而不是让顾客反复重试。
 */
const ALIYUN_SMS_MESSAGES: Record<string, string> = {
  'isv.SMS_SIGNATURE_ILLEGAL': '短信签名未通过审核，请联系平台运营核对短信配置',
  'isv.SMS_TEMPLATE_ILLEGAL': '短信模板未通过审核或模板变量不匹配，请联系平台运营',
  'isv.MOBILE_NUMBER_ILLEGAL': '手机号格式不正确，请检查后重试',
  'isv.AMOUNT_NOT_ENOUGH': '短信账户余额不足，请联系平台运营充值',
  'isv.BUSINESS_LIMIT_CONTROL': '发送过于频繁，请稍后再试',
  'isv.DAY_LIMIT_CONTROL': '今日短信发送次数已达上限，请明天再试',
  InvalidAccessKeyId: '短信 AccessKey 不正确，请联系平台运营核对配置',
  'InvalidAccessKeyId.NotFound': '短信 AccessKey 不存在，请联系平台运营核对配置',
  SignatureDoesNotMatch: '短信签名校验失败，请核对 AccessKey Secret 是否填错',
  Throttling: '短信接口被限流，请稍后重试',
  HTTP_403: '短信接口鉴权被拒（403），请确认 AccessKey 有 Dysmsapi 权限',
};

const SIGN_STATUS_LABELS: Record<number, string> = {
  0: '审核中',
  1: '审核通过',
  2: '审核失败',
  10: '已撤回',
};
