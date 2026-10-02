import type { Request } from 'express';
import type { Order } from '../../../database/entities/order.entity';
import type { Payment } from '../../../database/entities/payment.entity';
import type { PaymentRefund } from '../../../database/entities/payment-refund.entity';
import type { ProfitShare } from '../../../database/entities/profit-share.entity';
import type {
  NotifyType,
  PaymentChannel,
  PaymentStatus,
  RefundStatus,
} from '../constants/payment.constant';
import type { ProfitShareStatus } from '../constants/profit-share.constant';

/** 发给渠道的下单请求，字段已由支付域算好。 */
export interface CreatePaymentCommand {
  payment: Payment;
  order: Order;
  /** 微信 JSAPI 需要付款人 openid；支付宝需要 buyer_open_id */
  payerId?: string;
  /** 服务商模式下的特约商户号 sub_mchid / 支付宝收款 PID */
  channelAccount?: string;
  /** 是否需要后续分账（平台抽佣场景必须为 true） */
  needProfitSharing: boolean;
}

export interface CreatedPaymentResult {
  /** 渠道受理后的状态；mock 可能直接返回 succeeded */
  status: PaymentStatus;
  tradeNo: string | null;
  prepayId: string | null;
  /** 客户端调起支付所需参数（微信：timeStamp/nonceStr/package/signType/paySign；支付宝：orderStr） */
  payParams: Record<string, string>;
  paidAt: Date | null;
}

export interface ChannelTradeState {
  status: PaymentStatus;
  tradeNo: string | null;
  amountCents: number;
  paidAt: Date | null;
  raw: Record<string, unknown>;
}

export interface ChannelRefundResult {
  status: RefundStatus;
  channelRefundId: string | null;
  amountCents: number;
  raw: Record<string, unknown>;
}

/** 各渠道通知经"验签 + 解密 + 归一"后的统一结构，业务层只认这个。 */
export interface NormalizedNotify {
  notifyId: string;
  type: NotifyType;
  paymentNo: string | null;
  refundNo: string | null;
  tradeNo: string | null;
  amountCents: number | null;
  /** 交易是否成功；失败通知同样要落库并把单据置为终态 */
  succeeded: boolean;
  paidAt: Date | null;
  payload: Record<string, unknown>;
}

export interface NotifyAck {
  httpStatus: number;
  body: unknown;
}

/**
 * 分账请求：把一笔冻结的资金按接收方拆分。
 * 服务商模式下平台替商户分账，指令一次性下发全部接收方。
 */
export interface ProfitShareCommand {
  payment: Payment;
  shares: ProfitShare[];
}

export interface ChannelProfitShareResult {
  /** 渠道受理结果；成功即视为已冻结，等待 T+N 解冻 */
  status: ProfitShareStatus;
  /** 渠道分账单号 profit_sharing_id，用于后续解冻 */
  channelShareId: string | null;
  raw: Record<string, unknown>;
}

export interface ChannelUnfreezeResult {
  status: ProfitShareStatus;
  unfrozenAt: Date | null;
  raw: Record<string, unknown>;
}

/** 渠道账单里的一笔交易明细，对账时与本地支付单逐笔核对。 */
export interface ChannelBillDetail {
  /** 商户支付单号，对账的关联键 */
  outTradeNo: string;
  /** 渠道交易号 */
  transactionId: string | null;
  /** 渠道记账金额（分） */
  amountCents: number;
  /** 渠道手续费（分） */
  feeCents: number;
  /** 渠道侧记账的支付时间 */
  paidAt: Date | null;
}

/** 某日某渠道的渠道账单。渠道没出账时 details 为空、exists 为 false。 */
export interface ChannelBill {
  billDate: string;
  exists: boolean;
  details: ChannelBillDetail[];
}

/**
 * 下载渠道账单时给的本地参考账目。
 *
 * 真渠道（微信/支付宝）下载账单只要日期，不需要这个；但`mock` 渠道是个
 * **无状态模拟器**——它的内存交易表只活在单个进程里，而账单下载可能发生在
 * 另一个进程（定时任务）或重启之后，那时它对自己发过的支付一无所知。
 * 如果 mock 因此返回空账单，本地每一笔成功支付都会被判成 `missing_channel`，
 * 排障时全部是假差异。
 *
 * 所以把本地账目作为参考系传进去，让 mock 能"装作记得"这些交易，
 * 从而产出与真实渠道结构一致的账单。真实 provider 实现里忽略这个参数即可。
 */
export interface BillDownloadContext {
  merchantId: number;
  payments: { paymentNo: string; amountCents: number; tradeNo: string | null; paidAt: Date | null }[];
}

/**
 * 支付渠道端口。
 *
 * 抽象刻意只覆盖"下单/查单/关单/退款/通知"这五件事，且要求每个实现
 * 自己负责验签、解密与报文归一：微信（RSA 签名 + AEAD 解密 + JSON 应答）
 * 与支付宝（RSA2 签名 + 表单参数 + "success" 纯文本应答）差异极大，
 * 把差异关在实现里，业务层才不会长满 if (channel === ...)。
 *
 * 分账与对账是可选能力：渠道不支持时在实现里抛「该渠道不支持」，
 * 由上层按渠道能力决定是否生成分账单、是否纳入对账。
 */
export interface PaymentProvider {
  readonly channel: PaymentChannel;

  /** 凭据是否齐备；未就绪时下单要给出明确错误而不是半途失败。 */
  isReady(): boolean;

  create(command: CreatePaymentCommand): Promise<CreatedPaymentResult>;

  query(payment: Payment): Promise<ChannelTradeState>;

  close(payment: Payment): Promise<void>;

  refund(refund: PaymentRefund, payment: Payment): Promise<ChannelRefundResult>;

  /** 下发分账指令，冻结分给各接收方的资金。 */
  profitShare(command: ProfitShareCommand): Promise<ChannelProfitShareResult>;

  /** 到期解冻已冻结的分账资金。 */
  unfreezeShare(share: ProfitShare): Promise<ChannelUnfreezeResult>;

  /**
   * 下载指定日期的渠道账单明细，用于与本地账逐笔核对。
   * `context` 是可选的本地参考账目，无状态模拟渠道需要它来还原账单；
   * 真实渠道实现忽略即可。
   */
  downloadBill(billDate: string, context?: BillDownloadContext): Promise<ChannelBill>;

  /**
   * 校验并解析异步通知。验签失败必须抛异常，由上层记录并拒绝应答。
   */
  parseNotify(request: Request): Promise<NormalizedNotify>;

  /** 通知处理成功/失败后回给渠道的应答体，各渠道格式不同。 */
  buildAck(error?: string): NotifyAck;
}

export function readRawBody(request: Request): string {
  const raw = (request as Request & { rawBody?: Buffer }).rawBody;
  if (raw) {
    return Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  }
  return typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
}
