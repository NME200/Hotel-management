import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PRINT_GATEWAY_TIMEOUT_MS } from '../constants/print-provider.constant';
import type { EffectivePrintProviderConfig } from '../models/print-provider.model';
import type {
  CloudPrinterStateResult,
  CloudPrintCommand,
  CloudPrintProvider,
  CloudPrintResult,
} from './cloud-print-provider.interface';
import { renderReceiptText } from './receipt-text';

/**
 * 飞鹅云打印机（https://api.de.feieyun.com/Api/Open/）。
 *
 * 四个必须照着做的地方，都是官方文档里写死的：
 *
 * 1. **签名是 `sha1(user + UKEY + stime)`**，40 位小写。`stime` 参与签名，
 *    所以必须与请求里带的那一个完全一致 —— 先生成再签，别在两处各取一次时间。
 *    apikey（UKEY）泄露等于账号被完全接管。
 *
 * 2. **接口名走 `apiname` 参数**，不是 URL 路径。网关地址固定到 `/Api/Open/`，
 *    把 `Open_printMsg` 拼进路径会直接 404。
 *
 * 3. **表单编码提交**（`application/x-www-form-urlencoded`）。正文里有中文与 `<BR>` 标记，
 *    手工拼串会出乱码，所以交给 `URLSearchParams` 编码。
 *
 * 4. **`ret=0` 才是受理成功**。飞鹅在业务失败时同样回 HTTP 200，
 *    只看状态码会把"apikey 错"当成"已出纸"。
 *
 * 另有一条不在代码里的前提：打印机必须先绑定到这个 `user` 账号下
 * （后台手工添加 SN + 机身校验码，或走 `Open_printerAddlist`），
 * 否则凭据全对也会回「设备不存在」。
 */
@Injectable()
export class FeiePrintProvider implements CloudPrintProvider {
  readonly provider = 'feie' as const;

  private readonly logger = new Logger(FeiePrintProvider.name);

  /**
   * 就绪与否由配置服务判定（它拿着生效凭据），provider 这里只看自己被传入的配置。
   * 保留这个方法是为了与 `PaymentProvider` 端口形态一致，避免注册表两套约定。
   */
  async isReady(config: EffectivePrintProviderConfig): Promise<boolean> {
    return config.enabled && config.uid.length > 0 && config.apiKey.length > 0;
  }

  async print(command: CloudPrintCommand): Promise<CloudPrintResult> {
    const { config, deviceNo, copies, receipt, originId } = command;
    const content = renderReceiptText(receipt);

    const body = await this.request(
      config,
      'Open_printMsg',
      {
        sn: deviceNo,
        content,
        // 飞鹅的 times 就是"打印份数"，与 printer.copies 同义
        times: `${Math.max(copies, 1)}`,
        // 用本地任务 ID 当幂等键：重试带同一个 id，网关不会重复出纸
        id: originId,
      },
      config.apiKey,
    );

    const ret = Number(body.ret ?? -1);
    if (ret === 0) {
      return {
        accepted: true,
        channelOrderId: typeof body.data === 'string' ? body.data : null,
        raw: body,
        failureReason: null,
      };
    }

    const reason = this.translate(body);
    this.logger.warn(`飞鹅推单被拒 sn=${deviceNo} ret=${ret} msg=${reason}`);
    return { accepted: false, channelOrderId: null, raw: body, failureReason: reason };
  }

  async queryState(
    config: EffectivePrintProviderConfig,
    deviceNo: string,
  ): Promise<CloudPrinterStateResult> {
    const body = await this.request(config, 'Open_queryPrinterStatus', { sn: deviceNo }, config.apiKey);
    const ret = Number(body.ret ?? -1);
    const data = typeof body.data === 'string' ? body.data : '';

    if (ret !== 0) {
      return { online: false, message: this.translate(body), raw: body };
    }
    // 飞鹅用一句中文描述设备状态（"在线，工作状态正常" / "离线" …），
    // 直接透给商家看比翻译成枚举更有排查价值
    return { online: data.includes('在线'), message: data || '未返回状态', raw: body };
  }

  async probe(config: EffectivePrintProviderConfig): Promise<{ ok: boolean; message: string }> {
    try {
      // 用「查无此机」的 sn 探凭据：凭据错会回签名/账号类错误，
      // 凭据对但机器不存在会回"打印机不存在"，两者区分得开
      const body = await this.request(
        config,
        'Open_queryPrinterStatus',
        { sn: '__probe__' },
        config.apiKey,
      );
      const ret = Number(body.ret ?? -1);
      if (ret === 0) {
        return { ok: true, message: '凭据可用，飞鹅网关连通' };
      }
      const message = this.translate(body);
      // 凭据没问题但探测用的机器不存在，这属于自检本身的正常结果
      if (/不存在|打印机/.test(message)) {
        return { ok: true, message: '凭据可用，飞鹅网关连通（探测用的设备号不存在属正常）' };
      }
      return { ok: false, message };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '飞鹅自检失败' };
    }
  }

  private async request(
    config: EffectivePrintProviderConfig,
    apiname: string,
    params: Record<string, string>,
    apiKey: string,
  ): Promise<Record<string, unknown>> {
    if (!config.uid || !apiKey) {
      throw new Error('飞鹅凭据未配置：缺少账号 user 或 UKEY');
    }

    // stime 参与签名，所以只能取一次：先算时间戳，再签，再把同一个值发出去
    const stime = `${Math.floor(Date.now() / 1000)}`;
    const form = new URLSearchParams({
      user: config.uid,
      stime,
      sig: createHash('sha1').update(`${config.uid}${apiKey}${stime}`).digest('hex'),
      apiname,
      ...params,
    });

    let response: globalThis.Response;
    try {
      response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/Api/Open/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        signal: AbortSignal.timeout(PRINT_GATEWAY_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`飞鹅网关请求失败 apiname=${apiname}: ${message}`);
      throw new Error(`无法连接飞鹅云打印机服务：${message}`);
    }

    const text = await response.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`飞鹅网关返回异常（HTTP ${response.status}）`);
    }
  }

  /** 飞鹅错误码翻译。未收录的码把原文带上，便于对照官方文档。 */
  private translate(body: Record<string, unknown>): string {
    const ret = Number(body.ret ?? -1);
    const raw = typeof body.msg === 'string' ? body.msg : '';
    return FEIE_ERROR_MESSAGES[ret] ?? `飞鹅返回错误（ret=${ret}${raw ? ` ${raw}` : ''}）`;
  }
}

const FEIE_ERROR_MESSAGES: Record<number, string> = {
  1: '飞鹅账号 user 或 UKEY 不正确（签名按 sha1(user+UKEY+stime) 算，两者任一填错都会回这个码）',
  2: '飞鹅接口已停用',
  3: '飞鹅账号已过期',
  4: '飞鹅账号余额不足',
  5: '设备号不存在：先核对机身 SN，并确认这台机器已绑定到该 user 账号下（飞鹅后台添加或用 Open_printerAddlist）',
  6: '设备已停用',
  7: '打印内容为空或超出长度限制',
  8: '打印份数不合法',
};
