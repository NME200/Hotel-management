export const PaymentChannel = {
  Wechat: 'wechat',
  Alipay: 'alipay',
  Mock: 'mock',
} as const;
export type PaymentChannel = (typeof PaymentChannel)[keyof typeof PaymentChannel];

export const PaymentStatus = {
  Created: 'created',
  Paying: 'paying',
  Succeeded: 'succeeded',
  Failed: 'failed',
  Closed: 'closed',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

/** 仍可继续支付的状态，终态之外的都算。 */
export const OPEN_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  PaymentStatus.Created,
  PaymentStatus.Paying,
];

export const RefundStatus = {
  Processing: 'processing',
  Succeeded: 'succeeded',
  Failed: 'failed',
} as const;
export type RefundStatus = (typeof RefundStatus)[keyof typeof RefundStatus];

export const NotifyType = {
  Payment: 'payment',
  Refund: 'refund',
} as const;
export type NotifyType = (typeof NotifyType)[keyof typeof NotifyType];

/** 支付单有效期：超时后主动关单，避免顾客端拿到失效的调起参数。 */
export const PAYMENT_EXPIRE_MINUTES = 15;
