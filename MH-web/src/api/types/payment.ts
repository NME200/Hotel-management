/** 支付渠道：微信支付服务商 / 支付宝 / 平台模拟支付 */
export type PaymentChannel = 'wechat' | 'alipay' | 'mock'

/** 商家侧收款状态：未申请 / 待审核 / 已开通 / 已驳回 / 已停用 */
export type MerchantPaymentStatus = 'not_applied' | 'pending_audit' | 'enabled' | 'rejected' | 'disabled'

/**
 * GET /merchant/payment-configs 的单项。
 * 渠道密钥全部留在平台侧，商家端永远不会出现任何密钥字段。
 */
export interface MerchantPaymentConfigItem {
  /** 未申请过的渠道后端返回 null */
  id: number | null
  merchantId: number
  channel: PaymentChannel
  /** 渠道中文名，由后端下发：微信支付 / 支付宝 / 模拟支付 */
  channelLabel: string
  status: MerchantPaymentStatus
  /** 特约商户号 sub_mchid / 支付宝 partner id */
  channelAccount: string | null
  /** 渠道费率，形如 0.006，展示为 0.6% */
  feeRate: number | null
  /** 平台抽佣比例，展示为百分比 */
  profitShareRate: number | null
  settleAccountName: string | null
  /** 后端已脱敏，前端直接展示，不可回填到申请表单 */
  settleAccountNoMasked: string | null
  licenseNo: string | null
  contactName: string | null
  contactPhone: string | null
  appliedAt: string | null
  appliedByName: string | null
  auditedAt: string | null
  auditedByName: string | null
  /** 驳回原因在此字段 */
  auditRemark: string | null
  updatedAt: string | null
  /** 平台是否开放该渠道，false 时商家不能申请 */
  channelOpen: boolean
}

/**
 * POST /merchant/payment-configs/apply 的请求体。
 * feeRate 与 profitShareRate 由平台侧维护，商家端只展示、提交时不带。
 */
export interface PaymentApplyInput {
  channel: PaymentChannel
  /** 特约商户号：2-32 位字母数字 */
  channelAccount: string
  licenseNo?: string
  settleAccountName?: string
  /** 未脱敏的完整结算账号，仅商户重新填写时提交 */
  settleAccountNo?: string
  contactName?: string
  contactPhone?: string
  feeRate?: number
  profitShareRate?: number
}
