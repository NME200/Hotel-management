export const PaymentChannel = {
  Wechat: 'wechat',
  Alipay: 'alipay',
  Mock: 'mock',
  /** 现金：收银台当面收钱，没有渠道报文，创建即成功 */
  Cash: 'cash',
  /** 收款码被扫：顾客扫商户自己的收款码，收银员确认到账，同样无渠道对接 */
  Offline: 'offline',
} as const;
export type PaymentChannel = (typeof PaymentChannel)[keyof typeof PaymentChannel];

/**
 * 线下收款渠道：钱不经过平台，收银员当面收完即完成。
 *
 * 与微信/支付宝这类「在线渠道」的区别贯穿整条链路，因此单独列出来而不是靠
 * `channel === 'cash'` 到处散写：
 * - 不需要平台开渠道开关、不需要商户进件，所以渠道配置列表里**不出现**；
 * - 没有渠道账单，因此**不参与对账**（见 RECONCILE_ENABLED_CHANNELS）；
 * - 平台无法在资金流里自动抽佣，分账单金额天然为 0；
 * - 没有异步通知，状态在下单那一刻就是终态。
 */
export const OFFLINE_CHANNELS: readonly PaymentChannel[] = [
  PaymentChannel.Cash,
  PaymentChannel.Offline,
];

export function isOfflineChannel(channel: PaymentChannel): boolean {
  return OFFLINE_CHANNELS.includes(channel);
}

/** 需要平台配密钥、商户走进件、资金经渠道结算的「在线渠道」。 */
export const ONLINE_CHANNELS: readonly PaymentChannel[] = Object.values(PaymentChannel).filter(
  (channel) => !isOfflineChannel(channel),
);

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
