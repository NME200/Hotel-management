import type { ReceiptData } from '../../merchant/print/dto/print.dto';
import type { EffectivePrintProviderConfig } from '../models/print-provider.model';

/**
 * 推给厂商网关的一次小票打印任务。
 *
 * `deviceNo` 是商家在商家端录入的那个「编码」（厂商机身号 sn）；
 * `originId` 是本地打印任务 ID —— 厂商用它做幂等：
 * 重试时带同一个 originId，网关不会重复出纸。
 */
export interface CloudPrintCommand {
  config: EffectivePrintProviderConfig;
  deviceNo: string;
  copies: number;
  originId: string;
  receipt: ReceiptData;
}

export interface CloudPrintResult {
  /** 网关是否受理。受理 ≠ 已出纸，物理出纸要看打印机在线状态 */
  accepted: boolean;
  /** 厂商侧订单号，用于后续查单与排障 */
  channelOrderId: string | null;
  /** 厂商原始应答，失败时用于定位 */
  raw: Record<string, unknown>;
  /** 失败原因（网关拒绝 / 网络不通），成功时为 null */
  failureReason: string | null;
}

export interface CloudPrinterStateResult {
  /** 设备是否在线 */
  online: boolean;
  /** 厂商侧状态描述，直接透给商家端看 */
  message: string;
  raw: Record<string, unknown>;
}

/**
 * 云打印机厂商端口。
 *
 * 抽象只覆盖「推小票 / 查设备」两件事：这两家（以及以后要加的）
 * 差异全在鉴权与报文格式上 —— 飞鹅是 GET 表单 + sha1 签名，
 * 易联云是 OAuth2 取 token 再 POST JSON。把差异关在实现里，
 * `PrintService` 才不会长满 `if (provider === 'feie')`。
 */
export interface CloudPrintProvider {
  readonly provider: string;

  /**
   * 凭据是否齐备（含总开关）。未就绪时推单给出明确错误而不是半途失败。
   * 配置由调用方传入，provider 自己不查库 —— 否则鉴权逻辑与配置来源纠缠在一起。
   */
  isReady(config: EffectivePrintProviderConfig): Promise<boolean>;

  /** 推一张小票。实现内部负责鉴权、转义、超时与错误翻译。 */
  print(command: CloudPrintCommand): Promise<CloudPrintResult>;

  /** 查设备是否在线，供平台自检与商家端排障使用。 */
  queryState(config: EffectivePrintProviderConfig, deviceNo: string): Promise<CloudPrinterStateResult>;

  /** 平台端「自检」：只验凭据能不能换到访问权，不依赖某台设备。 */
  probe(config: EffectivePrintProviderConfig): Promise<{ ok: boolean; message: string }>;
}
