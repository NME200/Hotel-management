import type { PaymentChannel, PaymentStatus, RefundStatus } from '../constants/payment.constant';

/** 支付单对外视图：金额以元返回给前端，内部一律用分。 */
export interface PaymentView {
  id: number;
  merchantId: number;
  orderId: number;
  paymentNo: string;
  channel: PaymentChannel;
  tradeNo: string | null;
  amount: number;
  refundedAmount: number;
  status: PaymentStatus;
  payParams: Record<string, string> | null;
  expireAt: Date;
  paidAt: Date | null;
  closedAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
}

export interface RefundView {
  id: number;
  refundNo: string;
  paymentId: number;
  orderId: number;
  channel: PaymentChannel;
  channelRefundId: string | null;
  amount: number;
  status: RefundStatus;
  reason: string | null;
  operatorName: string | null;
  succeededAt: Date | null;
  createdAt: Date;
}
