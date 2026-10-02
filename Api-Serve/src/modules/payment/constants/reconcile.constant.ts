/**
 * 对账（本地账 vs 渠道账）常量。
 *
 * 对账与支付、分账一样是**独立的第三方状态机**：支付成功不代表账对得上，
 * 账平了也不代表支付流程没问题。三者状态互不派生。
 */

export const ReconcileStatus = {
  /** 渠道账单尚未取到（渠道没出账 / 下载失败），台账保留，等下次重试 */
  PendingBill: 'pending_bill',
  /** 台账重建中（渠道账单已取到，本地账目正在快照） */
  Running: 'running',
  /** 渠道与本地完全一致 */
  Balanced: 'balanced',
  /** 存在差异，已写入差异明细 */
  Mismatch: 'mismatch',
  /** 渠道明确拒绝（无该日账单权限等），需人工处理 */
  Failed: 'failed',
} as const;
export type ReconcileStatus = (typeof ReconcileStatus)[keyof typeof ReconcileStatus];

/** 尚未出结论、可在下一轮继续推进的状态。 */
export const OPEN_RECONCILE_STATUSES: readonly ReconcileStatus[] = [
  ReconcileStatus.PendingBill,
  ReconcileStatus.Running,
];

/**
 * 差异类型。刻意分成几类而不是一句"金额不一致"：
 * 不同类型对应完全不同的处理动作，混在一起运营没法排。
 */
export const ReconcileDiffType = {
  /** 渠道有、本地没有：可能是本地支付单丢单，也可能渠道串单 */
  MissingLocal: 'missing_local',
  /** 本地有、渠道没有：渠道漏记账（少见），需要向渠道发起查询 */
  MissingChannel: 'missing_channel',
  /** 金额不一致：渠道手续费/优惠/串单，金额差记在 diff_amount_cents */
  AmountMismatch: 'amount_mismatch',
  /** 渠道交易号与本地不一致 */
  TradeNoMismatch: 'trade_no_mismatch',
  /** 渠道账里同一笔支付单号出现多次，属重复记账 */
  DuplicateEntry: 'duplicate_entry',
} as const;
export type ReconcileDiffType = (typeof ReconcileDiffType)[keyof typeof ReconcileDiffType];

/**
 * 每日对账的触发点。选 02:00 是因为渠道账单通常在 T+1 凌晨出齐，
 * 太早下载会拿到不完整的账单（那会产生一堆假差异）。
 */
export const RECONCILE_CRON = '0 0 2 * * *';

/**
 * 可以自动对账的渠道。渠道没接入下载账单能力时（真微信/支付宝待资质）
 * 不纳入对账，避免每天生成一堆 pending_bill 噪音。
 */
export const RECONCILE_ENABLED_CHANNELS = ['mock'] as const;

/**
 * 渠道账单取不到时的重试上限。超限转 failed 交人工——
 * 无限重试只会让日志和台账一起被噪音淹掉。
 */
export const RECONCILE_MAX_RETRY = 5;

/**
 * 对账日回溯窗口（小时）。手动补跑不传日期时，
 * 默认对"昨天"这一整天，而不是扣满 24 小时——
 * 对账必须以自然日为界，否则跨日边界上的交易永远对不上。
 */
export const RECONCILE_DEFAULT_LOOKBACK_DAYS = 1;
