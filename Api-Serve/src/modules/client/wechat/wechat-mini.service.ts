import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheKey } from '../../../common/constants/cache-key';
import { BusinessException } from '../../../common/exceptions/business.exception';
import type { ConfigRoot } from '../../../config/configuration';
import { RedisService } from '../../redis/redis.service';
import { MiniProgramConfigService } from '../config/mini-program-config.service';

const WX_JS_CODE_2_SESSION = 'https://api.weixin.qq.com/sns/jscode2session';
const WX_ACCESS_TOKEN = 'https://api.weixin.qq.com/cgi-bin/token';
const WX_UNLIMITED_QRCODE = 'https://api.weixin.qq.com/wxa/getwxacodeunlimit';
const WX_PHONE_NUMBER = 'https://api.weixin.qq.com/wxa/business/getuserphonenumber';
const REQUEST_TIMEOUT_MS = 5000;
/** 二维码接口偶尔更慢（微信侧生成图片），给宽一点 */
const QRCODE_TIMEOUT_MS = 10000;
/** access_token 提前 5 分钟过期，避免边界上拿到一个已经失效的令牌 */
const TOKEN_SAFETY_SECONDS = 300;

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

/** 手机号快速验证组件换来的号码。 */
export interface WxPhoneResult {
  /**
   * 归一化后的手机号：国内（countryCode 86）就是 11 位原样号码，
   * 与商家导入的历史会员号码同格式，收银台按号认会员才能精确匹配上；
   * 国际号带 `+国家码` 前缀。
   */
  phone: string;
  countryCode: string;
}

interface WxPhoneResponse extends WxRawResponse {
  phone_info?: {
    phoneNumber?: string;
    purePhoneNumber?: string;
    countryCode?: string;
  };
}

export interface WxCredentialCheck {
  ok: boolean;
  message: string;
  errcode: number | null;
}

/** 生成小程序码的可选项，缺省值来自 `.env`（见 configuration.ts 的 miniProgram 段）。 */
export interface QrCodeOptions {
  /** 落地页，不带前导斜杠 */
  page?: string;
  /** 图片边长，默认 430（微信允许 280~1280） */
  width?: number;
  /** release | trial | develop */
  envVersion?: string;
  /**
   * 是否校验 page 存在。
   * 默认与 envVersion 联动：正式版才校验（微信要求 page 在已发布版本里存在）；
   * 体验版/开发版本来就没发布，开着只会拿到 41030。
   */
  checkPath?: boolean;
}

/**
 * 小程序凭据换取：`wx.login` 的 code 换 openid，以及生成桌位小程序码。
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

  constructor(
    private readonly configs: MiniProgramConfigService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService<ConfigRoot, true>,
  ) {}

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
   * 用「手机号快速验证组件」的 code 换真实手机号。
   *
   * 三条约束决定了这里的写法：
   * 1. **code 一次性**（5 分钟内有效，用过即废），所以失败不能让前端拿同一个 code 重试；
   * 2. **每次调用成功向开发者收 0.03 元**（每账号 1000 次体验额度），
   *    所以只在顾客点授权按钮时才调，绝不在静默登录里顺手调一次；
   * 3. **access_token 可能刚好过期**：这时 code 还没被消费（鉴权在消费之前），
   *    所以清掉缓存换一个令牌重试一次是安全的，能让顾客无感 ——
   *    否则这一次点击的额度就白花了。
   *
   * 只对**非个人主体且已认证**的小程序开放，没开通时微信回 48001，见下面的错误翻译。
   */
  async getPhoneNumber(code: string): Promise<WxPhoneResult> {
    const trimmed = code.trim();
    if (!trimmed) {
      throw BusinessException.badRequest('缺少手机号授权凭证，请重新点击授权');
    }

    let body = await this.requestPhone(await this.getAccessToken(), trimmed);
    if (body.errcode === 40001 || body.errcode === 42001) {
      await this.redis.del(CacheKey.miniProgramAccessToken());
      body = await this.requestPhone(await this.getAccessToken(), trimmed);
    }

    if (body.errcode && body.errcode !== 0) {
      const message = WX_PHONE_ERROR_MESSAGES[body.errcode];
      if (message) {
        this.logger.warn(`微信获取手机号失败 errcode=${body.errcode} errmsg=${body.errmsg ?? ''}`);
        throw new BusinessException(message, HttpStatus.BAD_GATEWAY);
      }
      throw this.translate(body, '获取手机号');
    }

    const pure = body.phone_info?.purePhoneNumber?.trim() ?? '';
    if (!pure) {
      throw new BusinessException('微信未返回手机号，请重新点击授权', HttpStatus.BAD_GATEWAY);
    }
    const countryCode = body.phone_info?.countryCode?.trim() || '86';
    return {
      phone: countryCode === '86' ? pure : `+${countryCode}${pure}`,
      countryCode,
    };
  }

  private async requestPhone(accessToken: string, code: string): Promise<WxPhoneResponse> {
    let response: globalThis.Response;
    try {
      response = await fetch(`${WX_PHONE_NUMBER}?access_token=${accessToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`微信获取手机号接口请求失败: ${message}`);
      throw new BusinessException('无法连接微信服务器，请稍后重试', HttpStatus.BAD_GATEWAY);
    }

    const text = await response.text();
    try {
      return JSON.parse(text) as WxPhoneResponse;
    } catch {
      this.logger.warn(`微信获取手机号接口返回非 JSON: HTTP ${response.status}`);
      throw new BusinessException(`微信接口返回异常（HTTP ${response.status}）`, HttpStatus.BAD_GATEWAY);
    }
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

  /**
   * 生成「一桌一码」用的小程序码（`wxa/getwxacodeunlimit`），返回 PNG 字节。
   *
   * 为什么用这个接口而不是普通二维码：微信内扫码能直接拉起小程序并把 scene
   * 交给落地页，顾客不用先打开小程序再点扫一扫，桌贴上只贴一张码就够。
   *
   * scene 上限 32 字符，本项目只放一个不可猜的桌位 token，不放桌号明文——
   * 桌号改了已印的码不用重印，且顾客无法自己拼 scene 把单下到别桌。
   */
  async getUnlimitedQrCode(scene: string, options: QrCodeOptions = {}): Promise<Buffer> {
    const trimmed = scene.trim();
    if (trimmed.length === 0 || trimmed.length > 32) {
      throw BusinessException.badRequest('小程序码 scene 长度需在 1~32 个字符之间');
    }

    const miniProgram = this.configService.get('app', { infer: true }).miniProgram;
    const token = await this.getAccessToken();
    const envVersion = options.envVersion ?? miniProgram.envVersion;
    const payload: Record<string, string | number | boolean> = {
      scene: trimmed,
      // 微信要求 page 不带前导斜杠、不能带参数（参数一律走 scene），带上会拿到 41030
      page: (options.page ?? miniProgram.qrPage).replace(/^\//, ''),
      env_version: envVersion,
      width: options.width ?? 430,
      check_path: options.checkPath ?? envVersion === 'release',
    };

    let response: globalThis.Response;
    try {
      response = await fetch(`${WX_UNLIMITED_QRCODE}?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(QRCODE_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`微信小程序码接口请求失败: ${message}`);
      throw new BusinessException('无法连接微信服务器，请稍后重试', HttpStatus.BAD_GATEWAY);
    }

    // 成功时直接回图片二进制；失败时回 JSON（content-type 可能是 json 或 text/plain）
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      const text = await response.text();
      let body: WxRawResponse = {};
      try {
        body = JSON.parse(text) as WxRawResponse;
      } catch {
        this.logger.warn(
          `微信小程序码接口返回非图片且非 JSON: HTTP ${response.status} ${text.slice(0, 200)}`,
        );
        throw new BusinessException(
          `生成小程序码失败（HTTP ${response.status}）`,
          HttpStatus.BAD_GATEWAY,
        );
      }
      // access_token 可能刚好过期：清掉缓存，让下次调用重新取
      if (body.errcode === 40001 || body.errcode === 42001) {
        await this.redis.del(CacheKey.miniProgramAccessToken());
      }
      throw this.translate(body, '生成小程序码');
    }

    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * 取 access_token 并缓存。
   *
   * 微信对该接口有频次限制，且 access_token 是全局共享的（再取一次会让旧令牌失效），
   * 所以必须走 Redis 复用；TTL 取微信给的 expires_in 再减 5 分钟安全垫。
   */
  private async getAccessToken(): Promise<string> {
    const cached = await this.redis.getJson<string>(CacheKey.miniProgramAccessToken());
    if (cached) {
      return cached;
    }

    const config = await this.configs.getEffective();
    if (!config.configured) {
      throw BusinessException.badRequest(
        `小程序尚未完成配置：${config.missingFields.join('、') || '凭据缺失'}，请平台运营在「小程序配置」中填写后再生成桌位码`,
      );
    }

    const body = await this.request<WxRawResponse>(
      WX_ACCESS_TOKEN,
      {
        grant_type: 'client_credential',
        appid: config.appId,
        secret: config.appSecret,
      },
      '获取 access_token',
    );
    if (!body.access_token) {
      throw this.translate(body, '获取 access_token');
    }

    const ttl = Math.max((body.expires_in ?? 7200) - TOKEN_SAFETY_SECONDS, 60);
    await this.redis.setJson(CacheKey.miniProgramAccessToken(), body.access_token, ttl);
    return body.access_token;
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

const WX_ERROR_MESSAGES: Record<number, string> = {  [-1]: '微信服务繁忙，请稍后重试',
  40029: '登录凭证无效，请重新登录',
  40163: '登录凭证已被使用，请重新登录',
  40013: 'AppID 不正确，请平台运营核对「小程序配置」',
  40001: 'AppSecret 不正确或已失效，请平台运营重新保存',
  40164: '服务器出口 IP 不在小程序后台白名单内',
  41004: '缺少 AppSecret，请平台运营在「小程序配置」中填写',
  45011: '登录过于频繁，请稍后再试',
  40225: '该小程序处于未上线状态，无法登录',
  // 小程序码相关
  41001: 'access_token 缺失或已过期，请重试',
  42001: 'access_token 已过期，请重试',
  40097: '小程序码参数不合法，请检查 scene 与 page',
  40129: '小程序码 scene 含非法字符（只允许数字、字母与 !#$&\'()*+,/:;=?@-._~）',
  40169: '小程序码 scene 不合法或长度超过 32 个字符',
  41030: '小程序页面不存在：请确认小程序已发布该页面，或把 MINI_ENV_VERSION 设为 trial/develop（未发布时用 release 必然报这个错）',
  45009: '微信接口调用超过频率限制，请稍后再生成',
  85096: '小程序码参数含系统保留字段，请检查调用参数',
  85079: '小程序没有线上版本，请先发布小程序或改用体验版（MINI_ENV_VERSION=trial）',
};

/**
 * 获取手机号接口的错误码。单独一张表是因为这里的话要说给顾客听，
 * 而且大半是「小程序本身没资格」这类平台侧配置问题，重试没有意义。
 */
const WX_PHONE_ERROR_MESSAGES: Record<number, string> = {
  40029: '手机号授权凭证无效，请重新点击授权',
  40163: '该授权码已被使用，请重新点击一次授权',
  40125: '小程序凭据不正确，请联系平台运营核对「小程序配置」',
  45009: '操作过于频繁，请稍后再试',
  47001: '获取手机号失败：该小程序不支持（个人主体或未认证的小程序没有这个能力）',
  48001: '小程序未开通手机号获取权限：需非个人主体且完成微信认证后在小程序后台申请',
};
