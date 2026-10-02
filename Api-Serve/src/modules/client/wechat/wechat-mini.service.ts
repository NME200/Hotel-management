import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { MiniProgramConfigService } from '../config/mini-program-config.service';

const WX_JS_CODE_2_SESSION = 'https://api.weixin.qq.com/sns/jscode2session';
const WX_ACCESS_TOKEN = 'https://api.weixin.qq.com/cgi-bin/token';
const REQUEST_TIMEOUT_MS = 5000;

interface WxRawResponse {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
  access_token?: string;
  expires_in?: number;
}

export interface WxLoginSession {
  openid: string;
  unionid: string | null;
}

export interface WxCredentialCheck {
  ok: boolean;
  message: string;
  errcode: number | null;
}

/**
 * 小程序凭据换取：`wx.login` 的 code 换 openid。
 *
 * 这里没有任何模拟分支——凭据没配就直接报「未完成配置」，
 * 因为登录态一旦伪造，后面所有订单与优惠券接口都会失去意义。
 *
 * 安全约束：
 * - session_key 只用于渠道侧解密，本项目当前不落库不下发，取到即丢弃；
 * - 任何日志与异常信息都不允许出现 AppSecret，出网前统一做脱敏。
 */
@Injectable()
export class WechatMiniService {
  private readonly logger = new Logger(WechatMiniService.name);

  constructor(private readonly configs: MiniProgramConfigService) {}

  async code2session(code: string): Promise<WxLoginSession> {
    const config = await this.configs.assertLoginAvailable();
    const body = await this.request<WxRawResponse>(
      WX_JS_CODE_2_SESSION,
      {
        appid: config.appId,
        secret: config.appSecret,
        js_code: code,
        grant_type: 'authorization_code',
      },
      '登录',
    );

    if (!body.openid) {
      // 微信在参数错误时也回 200 + errcode，缺 openid 一律按失败处理
      throw this.translate(body, '登录');
    }
    return { openid: body.openid, unionid: body.unionid ?? null };
  }

  /**
   * 用 cgi-bin/token 验证 AppID + AppSecret 这对凭据是否真的可用。
   * 注意该接口受小程序后台「IP 白名单」约束，40164 不代表登录不可用。
   */
  async verifyCredentials(): Promise<WxCredentialCheck> {
    const config = await this.configs.getEffective();
    if (!config.configured) {
      return {
        ok: false,
        message: `缺少 ${config.missingFields.join('、') || '凭据'}`,
        errcode: null,
      };
    }

    try {
      const body = await this.request<WxRawResponse>(
        WX_ACCESS_TOKEN,
        {
          grant_type: 'client_credential',
          appid: config.appId,
          secret: config.appSecret,
        },
        '自检',
        true,
      );
      if (body.access_token) {
        return { ok: true, message: '凭据可用，微信接口连通', errcode: 0 };
      }
      const errcode = body.errcode ?? null;
      const note = errcode === 40164 ? '（该提示仅影响自检，不影响顾客登录）' : '';
      return {
        ok: false,
        message: `${body.errmsg ?? '微信未返回 access_token'}${note}`,
        errcode,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? this.redact(error.message, config.appSecret) : '自检失败',
        errcode: null,
      };
    }
  }

  private async request<T>(
    endpoint: string,
    params: Record<string, string>,
    scene: string,
    allowErrorBody = false,
  ): Promise<T> {
    const url = new URL(endpoint);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    let response: globalThis.Response;
    try {
      response = await fetch(url.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`微信接口请求失败（${scene}）: ${message}`);
      throw new BusinessException(
        '无法连接微信服务器，请稍后重试',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const text = await response.text();
    let body: WxRawResponse;
    try {
      body = JSON.parse(text) as WxRawResponse;
    } catch {
      // 非 JSON 多半是被代理或网关拦下，把状态码告诉运维而不是抛裸异常
      this.logger.warn(`微信接口返回非 JSON（${scene}）: HTTP ${response.status}`);
      throw new BusinessException(`微信接口返回异常（HTTP ${response.status}）`, HttpStatus.BAD_GATEWAY);
    }

    if (allowErrorBody) {
      return body as T;
    }
    if (body.errcode && body.errcode !== 0) {
      throw this.translate(body, scene);
    }
    return body as T;
  }

  /** 把微信错误码翻译成顾客/运营看得懂的话，同时保住排查线索（errcode 进日志）。 */
  private translate(body: WxRawResponse, scene: string): BusinessException {
    const errcode = body.errcode ?? 0;
    this.logger.warn(`微信接口业务失败（${scene}）errcode=${errcode} errmsg=${body.errmsg ?? ''}`);
    const message = WX_ERROR_MESSAGES[errcode] ?? `微信${scene}失败（${errcode}）`;
    return new BusinessException(message, HttpStatus.UNAUTHORIZED);
  }

  private redact(value: string, secret: string): string {
    return secret ? value.split(secret).join('******') : value;
  }
}

const WX_ERROR_MESSAGES: Record<number, string> = {
  [-1]: '微信服务繁忙，请稍后重试',
  40029: '登录凭证无效，请重新登录',
  40163: '登录凭证已被使用，请重新登录',
  40013: 'AppID 不正确，请平台运营核对「小程序配置」',
  40001: 'AppSecret 不正确或已失效，请平台运营重新保存',
  40164: '服务器出口 IP 不在小程序后台白名单内',
  41004: '缺少 AppSecret，请平台运营在「小程序配置」中填写',
  45011: '登录过于频繁，请稍后再试',
  40225: '该小程序处于未上线状态，无法登录',
};
