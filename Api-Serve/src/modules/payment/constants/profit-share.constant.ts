/**
 * 分账（服务商模式平台抽佣）相关常量。
 *
 * 分账与支付是两条独立的状态机：支付成功只把支付单置为 succeeded，
 * 分账单的冻结/解冻是渠道侧的另一套时序，强行合并会让"钱已收但还没结算"
 * 这个中间态无处表达，所以单独建表、单独推进。
 */
export const ProfitShareStatus = {
  /** 已生成，尚未向渠道发起分账请求 */
  Pending: 'pending',
  /** 渠道已受理并冻结资金，等待解冻（T+1） */
  Frozen: 'frozen',
  /** 已到解冻时间，解冻请求处理中 */
  Unfreezing: 'unfreezing',
  /** 解冻完成，资金已到接收方账户 */
  Unfrozen: 'unfrozen',
  /** 分账或解冻失败，需要人工介入 */
  Failed: 'failed',
} as const;
export type ProfitShareStatus =
  (typeof ProfitShareStatus)[keyof typeof ProfitShareStatus];

/** 终态之外的状态都还能被定时任务推进。 */
export const OPEN_PROFIT_SHARE_STATUSES: readonly ProfitShareStatus[] = [
  ProfitShareStatus.Pending,
  ProfitShareStatus.Frozen,
  ProfitShareStatus.Unfreezing,
];

/** 分账接收方类型。 */
export const ProfitShareReceiver = {
  /** 平台抽佣 */
  Platform: 'platform',
  /** 商户（剩余货款） */
  Merchant: 'merchant',
} as const;
export type ProfitShareReceiver =
  (typeof ProfitShareReceiver)[keyof typeof ProfitShareReceiver];

/**
 * 分账冻结资金默认解冻天数（T+N）。
 * 微信/支付宝的分账资金默认为 T+1 自动解冻，这里做成常量便于统一调整。
 */
export const PROFIT_SHARE_UNFREEZE_DAYS = 1;

/** 解冻失败的重试上限，超过后置为 failed 交人工处理，避免无限重试。 */
export const PROFIT_SHARE_MAX_RETRY = 3;
