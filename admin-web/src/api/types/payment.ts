import type { PageQuery } from './common'

/** 渠道编码，与后端 payment-channel 模块一一对应 */
export type PaymentChannel = 'wechat' | 'alipay' | 'mock'

/** 当前生效配置的来源：后台保存的 / 回落 .env 的 / 完全没有 */
export type PaymentConfigSource = 'database' | 'env' | 'none'

/** 商户某条渠道的进件与开通状态 */
export type MerchantPaymentStatus = 'not_applied' | 'pending_audit' | 'enabled' | 'rejected' | 'disabled'

/** 平台可直接启停的状态子集 */
export type MerchantPaymentSwitchStatus = Extract<MerchantPaymentStatus, 'enabled' | 'disabled'>

/**
 * 密钥字段元信息：真实值永不下发，只给掩码与指纹。
 * masked 已配置时固定为 PAYMENT_SECRET_MASK，未配置时为空串。
 */
export interface PaymentSecretField {
  name: string
  label: string
  configured: boolean
  masked: string
  /** 密钥 sha256 前 8 位，未配置为 null；用于确认这次到底改没改 */
  fingerprint: string | null
}

/** GET /platform/payment-channels 列表项 */
export interface PaymentChannelItem {
  channel: PaymentChannel
  /** 中文名：微信支付 / 支付宝 / 模拟支付 */
  label: string
  /** 平台总开关 */
  enabled: boolean
  /** 凭据是否齐备（齐备才能下单） */
  ready: boolean
  /** ready=false 时未配置的字段名（英文 key） */
  missingFields: string[]
  source: PaymentConfigSource
  notifyUrl: string | null
  /** 微信服务商 AppID / 支付宝 AppID */
  appId: string | null
  /** 微信服务商商户号 */
  mchId: string | null
  /** 支付宝沙箱，非支付宝渠道为 null */
  sandbox: boolean | null
  secretFields: PaymentSecretField[]
  updatedAt: string | null
}

/**
 * PUT /platform/payment-channels/{channel}
 * secrets 约定：不传或传掩码 = 保持原值；传空串 = 清除该密钥。
 */
export interface PaymentChannelUpdateInput {
  enabled?: boolean
  notifyUrl?: string | null
  appId?: string | null
  mchId?: string | null
  sandbox?: boolean | null
  secrets?: Record<string, string>
}

/** POST /platform/payment-channels/{channel}/test */
export interface PaymentChannelTestResult {
  ok: boolean
  message: string
  checkedAt: string
}

/** GET /platform/merchant-payment-configs 列表项（仅真实进件记录，未申请的两条见 channel 视图接口） */
export interface MerchantPaymentConfigItem {
  /** not_applied 时还没有配置记录，为 null，此时不可审核与启停 */
  id: number | null
  merchantId: number
  /** 单商户全渠道视图不返回商户信息，列表接口才有 */
  merchantCode?: string
  merchantName?: string
  channel: PaymentChannel
  channelLabel: string
  status: MerchantPaymentStatus
  /** 特约商户号 */
  channelAccount: string | null
  /** 渠道费率，如 0.006 */
  feeRate: number | null
  /** 平台抽佣比例，如 0.0038 */
  profitShareRate: number | null
  settleAccountName: string | null
  /** 后端已脱敏，如 6222****8888，前端直接展示 */
  settleAccountNoMasked: string | null
  licenseNo: string | null
  contactName: string | null
  contactPhone: string | null
  appliedAt: string | null
  /** 商户侧提交人姓名 */
  appliedByName: string | null
  auditedAt: string | null
  /** 平台审核人 */
  auditedByName: string | null
  auditRemark: string | null
  updatedAt: string | null
  /** 平台渠道总开关 + 凭据是否就绪；false 时该商户这条渠道即使 enabled 也收不了款 */
  channelOpen: boolean
}

/** GET /platform/merchant-payment-configs 查询参数；not_applied 不是合法筛选值 */
export type MerchantPaymentFilterStatus = Exclude<MerchantPaymentStatus, 'not_applied'>
export interface MerchantPaymentConfigListParams extends PageQuery {
  status?: MerchantPaymentFilterStatus
  channel?: PaymentChannel
  /** 从商户详情等入口带过来时只看单个商户 */
  merchantId?: number
}

/** GET /platform/merchant-payment-configs/summary */
export interface MerchantPaymentSummary {
  pendingAudit: number
  enabled: number
  rejected: number
  disabled: number
  notApplied: number
}

/** POST /platform/merchant-payment-configs/{id}/audit，驳回时 auditRemark 由后端校验必填 */
export interface MerchantPaymentAuditInput {
  approved: boolean
  auditRemark?: string
}

/** PATCH /platform/merchant-payment-configs/{id}/status */
export interface MerchantPaymentStatusInput {
  status: MerchantPaymentSwitchStatus
}

/* ------------------------------ 平台支付流水 ------------------------------ */

/** 支付单状态：created 已创建 / paying 支付中 / succeeded 已成功 / failed 失败 / closed 已关单 */
export type PaymentStatus = 'created' | 'paying' | 'succeeded' | 'failed' | 'closed'

/** 退款单状态：processing 处理中 / succeeded 已成功 / failed 失败 */
export type RefundStatus = 'processing' | 'succeeded' | 'failed'

/** GET /platform/payments 列表项 */
export interface PlatformPaymentItem {
  id: number
  /** 渠道交易号，未支付时为空 */
  tradeNo: string | null
  /** 平台支付单号 */
  paymentNo: string
  merchantId: number
  merchantCode: string
  merchantName: string
  orderId: number
  orderNo: string | null
  channel: PaymentChannel
  /** 渠道内的商户号 */
  channelAccount: string | null
  /** 支付金额（元） */
  amount: number
  /** 已退金额（元） */
  refundedAmount: number
  status: PaymentStatus
  /** 是否标记需要分账，平台后续分账任务的入口 */
  needProfitSharing: boolean
  /** 该支付单收到的渠道通知条数，>1 说明有重复通知（去重是否生效的观测点） */
  notifyCount: number
  expireAt: string
  paidAt: string | null
  closedAt: string | null
  failureReason: string | null
  createdAt: string
}

/** GET /platform/payments 查询参数 */
export interface PlatformPaymentListParams extends PageQuery {
  merchantId?: number
  channel?: PaymentChannel
  status?: PaymentStatus
  /** 起始日期，后端按天首尾截断 */
  from?: string
  /** 结束日期 */
  to?: string
  /** 订单号，精确匹配 */
  orderNo?: string
}

/** GET /platform/payments/summary 顶部统计卡 */
export interface PlatformPaymentSummary {
  totalCount: number
  totalAmount: number
  todayCount: number
  todayAmount: number
  refundAmount: number
  refundCount: number
  openCount: number
  closedCount: number
  failedCount: number
}

/** GET /platform/payments/refunds 列表项 */
export interface PlatformRefundItem {
  id: number
  refundNo: string
  merchantId: number
  merchantCode: string
  merchantName: string
  orderId: number
  orderNo: string | null
  paymentNo: string | null
  channel: PaymentChannel
  channelRefundId: string | null
  /** 本次退款金额（元） */
  amount: number
  /** 该支付单总额（元） */
  totalAmount: number
  status: RefundStatus
  reason: string | null
  operatorName: string | null
  succeededAt: string | null
  createdAt: string
}

/** GET /platform/payments/refunds 查询参数 */
export interface PlatformRefundListParams extends PageQuery {
  merchantId?: number
  channel?: PaymentChannel
  status?: RefundStatus
  from?: string
  to?: string
}

/** GET /platform/payments/{paymentNo}/notifies 单条渠道通知记录 */
export interface PlatformPaymentNotifyLog {
  id: number
  channel: PaymentChannel
  /** payment 支付通知 / refund 退款通知 */
  notifyType: string
  notifyId: string | null
  tradeNo: string | null
  amount: number | null
  /** 验签是否通过 */
  verified: boolean
  /** 是否已处理（重复通知会置 false） */
  handled: boolean
  processResult: string | null
  payload: Record<string, unknown> | null
  rawBody: string | null
  createdAt: string
}

/* ------------------------------ 平台分账 ------------------------------ */

/**
 * 分账单状态：pending 待下发 / frozen 已冻结 / unfreezing 解冻中 /
 * unfrozen 已解冻 / failed 失败。与支付状态是两条独立状态机。
 */
export type ProfitShareStatus = 'pending' | 'frozen' | 'unfreezing' | 'unfrozen' | 'failed'

/** GET /platform/profit-shares 列表项（同一支付单的平台侧 + 商户侧已合并为一行） */
export interface PlatformProfitShareItem {
  /** 平台侧分账单号（该支付单的锚点） */
  shareNo: string
  paymentId: number
  paymentNo: string | null
  merchantId: number
  merchantCode: string
  merchantName: string
  orderId: number
  channel: PaymentChannel
  /** 支付额（元） */
  totalAmount: number
  /** 平台抽佣（元） */
  platformAmount: number
  /** 商户结算（元） */
  merchantAmount: number
  /** 抽佣比例，如 0.0038 */
  rate: number | null
  /** 合并后的业务状态（以平台侧为准） */
  status: ProfitShareStatus
  platformStatus: ProfitShareStatus
  merchantStatus: ProfitShareStatus
  /** 计划解冻时间（T+1） */
  unfreezeAt: string
  /** 实际解冻时间 */
  unfrozenAt: string | null
  failureReason: string | null
  createdAt: string
}

/** GET /platform/profit-shares 查询参数 */
export interface PlatformProfitShareListParams extends PageQuery {
  merchantId?: number
  channel?: PaymentChannel
  status?: ProfitShareStatus
  /** 起始日期（按解冻到期日筛选） */
  from?: string
  /** 结束日期 */
  to?: string
  /** 订单号，精确匹配 */
  orderNo?: string
}

/** GET /platform/profit-shares/summary 顶部统计卡 */
export interface PlatformProfitShareSummary {
  /** 累计平台抽佣（元） */
  totalCommission: number
  /** 今日平台抽佣（元） */
  todayCommission: number
  /** 待解冻笔数（pending + frozen + unfreezing） */
  pendingCount: number
  /** 状态为 frozen 的笔数 */
  frozenCount: number
  /** 已解冻笔数 */
  unfrozenCount: number
  /** 解冻失败笔数 */
  failedCount: number
}

/* ------------------------------ 交易对账 ------------------------------ */

/**
 * 对账台账状态：pending_bill 渠道账单未出 / running 重建中 /
 * balanced 账平 / mismatch 有差异 / failed 需人工。
 * 与支付、分账都是独立状态机。
 */
export type ReconcileStatus = 'pending_bill' | 'running' | 'balanced' | 'mismatch' | 'failed'

/**
 * 差异类型。刻意分细：不同类型对应完全不同的处理动作
 * （missing_local 查丢单，amount_mismatch 查手续费/串单）。
 */
export type ReconcileDiffType =
  | 'missing_local'
  | 'missing_channel'
  | 'amount_mismatch'
  | 'trade_no_mismatch'
  | 'duplicate_entry'

/** GET /platform/reconciliations 列表项：一行 = 商户 × 渠道 × 自然日 */
export interface PlatformReconcileItem {
  id: number
  reconcileNo: string
  merchantId: number
  merchantCode: string
  merchantName: string
  channel: PaymentChannel
  /** 对账日 YYYY-MM-DD */
  tradeDate: string
  /** 渠道侧：笔数 / 金额（元）/ 手续费（元） */
  channelCount: number
  channelAmount: number
  channelFee: number
  /** 本地侧：笔数 / 金额（元）/ 当日退款（元，不冲抵交易额） */
  localCount: number
  localAmount: number
  localRefund: number
  /** 差异笔数 / 差异金额（元，按绝对值累加） */
  diffCount: number
  diffAmount: number
  status: ReconcileStatus
  billDownloaded: boolean
  billFetchedAt: string | null
  retryCount: number
  nextRetryAt: string | null
  reconciledAt: string | null
  failureReason: string | null
  createdAt: string
}

/** 单条差异明细 */
export interface PlatformReconcileDetailItem {
  id: number
  reconcileId: number
  merchantId: number
  channel: PaymentChannel
  diffType: ReconcileDiffType
  /** 商户支付单号，对账关联键 */
  outTradeNo: string
  paymentId: number | null
  channelAmount: number | null
  localAmount: number | null
  diffAmount: number
  channelTradeNo: string | null
  localTradeNo: string | null
  remark: string
  channelPaidAt: string | null
}

/** GET /platform/reconciliations/:reconcileNo 详情 */
export interface PlatformReconcileDetail {
  reconcile: PlatformReconcileItem
  details: PlatformReconcileDetailItem[]
}

/** GET /platform/reconciliations 查询参数 */
export interface PlatformReconcileListParams extends PageQuery {
  merchantId?: number
  channel?: PaymentChannel
  status?: ReconcileStatus
  /** 起始对账日 YYYY-MM-DD */
  from?: string
  /** 结束对账日 YYYY-MM-DD */
  to?: string
}

/** GET /platform/reconciliations/summary 顶部统计卡 */
export interface PlatformReconcileSummary {
  /** 最近一次对账的对账日 YYYY-MM-DD */
  lastTradeDate: string | null
  balancedCount: number
  mismatchCount: number
  pendingCount: number
  failedCount: number
  /** 未平账的差异金额合计（元） */
  diffAmount: number
}

/** POST /platform/reconciliations/run 手动补跑结果 */
export interface RunReconcileResult {
  tradeDate: string
  channel: PaymentChannel | null
  /** 本轮处理的台账数 */
  handled: number
}
