import type {
  PaymentChannel,
  PaymentStatus,
  RefundStatus,
} from '../constants/payment.constant';

/**
 * 平台端支付流水视图：在商家端 PaymentView 基础上补商户身份，
 * 外加该笔支付的可追溯信息（是否有通知日志、是否需分账）。
 */
export interface PlatformPaymentItem {
  id: number;
  tradeNo: string | null;
  paymentNo: string;
  merchantId: number;
  merchantCode: string;
  merchantName: string;
  orderId: number;
  orderNo: string | null;
  channel: PaymentChannel;
  channelAccount: string | null;
  amount: number;
  refundedAmount: number;
  status: PaymentStatus;
  needProfitSharing: boolean;
  notifyCount: number;
  expireAt: Date;
  paidAt: Date | null;
  closedAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
}

/** 平台端退款流水视图，同样带商户身份与原支付单号。 */
export interface PlatformRefundItem {
  id: number;
  refundNo: string;
  merchantId: number;
  merchantCode: string;
  merchantName: string;
  orderId: number;
  orderNo: string | null;
  paymentNo: string | null;
  channel: PaymentChannel;
  channelRefundId: string | null;
  amount: number;
  totalAmount: number;
  status: RefundStatus;
  reason: string | null;
  operatorName: string | null;
  succeededAt: Date | null;
  createdAt: Date;
}

/**
 * 平台支付概况。口径固定为「已成功的支付单」，
 * 未支付/已关单不算交易额，退款单独统计不冲抵——冲抵后看不出真实交易规模。
 */
export interface PlatformPaymentSummary {
  /** 全部成功笔数与金额（元） */
  totalCount: number;
  totalAmount: number;
  /** 今日成功笔数与金额（元） */
  todayCount: number;
  todayAmount: number;
  /** 累计退款金额（元） */
  refundAmount: number;
  /** 退款笔数 */
  refundCount: number;
  /** 门禁：仍处于 created/paying 且未过期的支付单数量 */
  openCount: number;
  /** 已关单数量 */
  closedCount: number;
  /** 失败数量 */
  failedCount: number;
}
