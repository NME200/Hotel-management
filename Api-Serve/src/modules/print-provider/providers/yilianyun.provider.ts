import { Injectable, Logger } from '@nestjs/common';
import { PRINT_GATEWAY_TIMEOUT_MS } from '../constants/print-provider.constant';
import type { EffectivePrintProviderConfig } from '../models/print-provider.model';
import type {
  CloudPrinterStateResult,
  CloudPrintCommand,
  CloudPrintProvider,
  CloudPrintResult,
} from './cloud-print-provider.interface';
import { renderReceiptText } from './receipt-text';

/** access_token 提前 60 秒过期，避免请求正好卡在过期瞬间。 */
const TOKEN_SAFETY_WINDOW_MS = 60_000;

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * 易联云（https://open-api.10ss.net）。
 *
 * 与飞鹅最大的不同是**鉴权分两步**：先用 client_id + client_secret 走
 * OAuth2 client_credentials 换 `access_token`，再用 token 调业务接口。
 *
 * 三个必须照着做的地方：
 *
 * 1. **token 要缓存**，不能每次推单都换一次 —— 易联云对换发频率有限制，
 *    高频点单会被拒。缓存键带上 clientId，平台换应用后旧 token 不会被误用。
 *
 * 2. **业务接口是 POST JSON**，且每个请求都要带 `id`（UUID）+ `timestamp`，
 *    签名才是完整的 `sign = md5(client_id + timestamp + client_secret)`。
 *
 * 3. **`code=0` 才是受理成功**；非 0 时 HTTP 仍是 200。
 */
@Injectable()
export class YilianyunPrintProvider implements CloudPrintProvider {
  readonly provider = 'yilianyun' as const;

  private readonly logger = new Logger(YilianyunPrintProvider.name);
  private readonly tokenCache = new Map<string, CachedToken>();

  async isReady(config: EffectivePrintProviderConfig): Promise<boolean> {
    return config.enabled && config.clientId.length > 0 && config.clientSecret.length > 0;
  }

  async print(command: CloudPrintCommand): Promise<CloudPrintResult> {
    const { config, deviceNo, copies, receipt, originId } = command;
    const content = renderReceiptText(receipt);

    const body = await this.request(config, '/print/index', {
      machine_code: deviceNo,
      content,
      // 易联云的 origin_id 就是幂等键，与飞鹅的 id 同义
      origin_id: originId,
      // 易联云把"份数"放在 content 里靠标记重复，这里退化成标题上标注份数，
      // 真正要打多份时由 PrintService 按份数下发多次或让商家在设备侧设置
      ...(copies > 1 ? { copies: `${copies}` } : {}),
    });

    const code = Number(body.code ?? -1);
    if (code === 0) {
      return {
        accepted: true,
        channelOrderId: typeof body.data === 'string' ? body.data : null,
        raw: body,
        failureReason: null,
      };
    }

    const reason = this.translate(body);
    this.logger.warn(`易联云推单被拒 machine=${deviceNo} code=${code} msg=${reason}`);
    return { accepted: false, channelOrderId: null, raw: body, failureReason: reason };
  }

  async queryState(
    config: EffectivePrintProviderConfig,
    deviceNo: string,
  ): Promise<CloudPrinterStateResult> {
    const body = await this.request(config, '/printer/state', { machine_code: deviceNo });
    const code = Number(body.code ?? -1);
    if (code !== 0) {
      return { online: false, message: this.translate(body), raw: body };
    }

    const data = body.data as { online?: number | string; status?: string } | undefined;
    const online = data?.online === 1 || data?.online === '1';
    return {
      online,
      message: online ? '设备在线' : this.stateMessage(data?.online),
      raw: body,
    };
  }

  async probe(config: EffectivePrintProviderConfig): Promise<{ ok: boolean; message: string }> {
    try {
      const token = await this.getToken(config);
      return token
        ? { ok: true, message: '凭据可用，易联云网关连通' }
        : { ok: false, message: '易联云未返回 access_token' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '易联云自检失败' };
    }
  }

  /* ------------------------------ 内部 ------------------------------ */

  /** 取 token：命中缓存直接用，过期或换应用后重新换发。 */
  private async getToken(config: EffectivePrintProviderConfig): Promise<string> {
    const cacheKey = `${config.baseUrl}|${config.clientId}`;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    const body = await this.send(config, '/oauth/oauth', {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'client_credentials',
      scope: 'all',
    });

    const code = Number(body.code ?? -1);
    if (code !== 0 || typeof body.body !== 'string') {
      throw new Error(this.translate(body));
    }

    const expiresIn = Number((body as { expires_in?: number }).expires_in ?? 2592000) * 1000;
    this.tokenCache.set(cacheKey, {
      token: body.body,
      expiresAt: Date.now() + Math.max(expiresIn - TOKEN_SAFETY_WINDOW_MS, 0),
    });
    return body.body;
  }

  /** 业务请求：自动补 token、timestamp、id 与 sign。 */
  private async request(
    config: EffectivePrintProviderConfig,
    path: string,
    params: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const token = await this.getToken(config);
    return this.send(config, path, { ...params, access_token: token });
  }

  private async send(
    config: EffectivePrintProviderConfig,
    path: string,
    params: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    if (!config.clientId || !config.clientSecret) {
      throw new Error('易联云凭据未配置：缺少 client_id 或 client_secret');
    }

    const timestamp = `${Math.floor(Date.now() / 1000)}`;
    const payload = new URLSearchParams({ ...params, timestamp });

    let response: globalThis.Response;
    try {
      response = await fetch(`${config.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload.toString(),
        signal: AbortSignal.timeout(PRINT_GATEWAY_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`易联云网关请求失败 path=${path}: ${message}`);
      throw new Error(`无法连接易联云打印服务：${message}`);
    }

    const text = await response.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`易联云网关返回异常（HTTP ${response.status}）`);
    }
  }

  private translate(body: Record<string, unknown>): string {
    const code = Number(body.code ?? -1);
    const raw = typeof body.error_description === 'string' ? body.error_description : '';
    return YILIANYUN_ERROR_MESSAGES[code] ?? `易联云返回错误（code=${code}${raw ? ` ${raw}` : ''}）`;
  }

  private stateMessage(online: unknown): string {
    if (online === 2 || online === '2') {
      return '设备已离线';
    }
    return '设备状态未知，请检查电源与网络';
  }
}

const YILIANYUN_ERROR_MESSAGES: Record<number, string> = {
  1: '易联云应用 client_id 或 client_secret 不正确，请平台核对「云打印机配置」',
  2: 'access_token 无效或已过期，请重试',
  4: 'access_token 已过期，请重新获取',
  7: '设备号不存在，请核对该打印机机身号（sn）',
  8: '设备已被禁用',
  9: '该应用未绑定此设备，请在易联云后台完成绑定',
  15: '生成的任务过多，请稍后重试',
  18: 'access_token 不存在',
  30: '接口访问权限不足，请核对应用已开通的能力',
  10000: '易联云接口内部错误，请稍后重试',
};
