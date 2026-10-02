import type { PageQuery } from './common'

export type MerchantStatus = 'pending_audit' | 'active' | 'disabled' | 'expired'

export type StoreStatus = 'open' | 'closed'

export interface MerchantListItem {
  id: number
  code: string
  name: string
  contactName: string
  contactPhone: string
  logo: string | null
  status: MerchantStatus
  expireAt: string | null
  remark: string | null
  createdAt: string
  storeName: string | null
  staffCount: number
}

/** 商户下的默认门店简要信息 */
export interface StoreBrief {
  id: number
  name: string
  status: StoreStatus
  logo: string | null
  province: string | null
  city: string | null
  district: string | null
  address: string | null
  phone: string | null
  notice: string | null
  /** 营业时段，形如 ["10:00-14:00", "17:00-21:00"] */
  businessHours: string[]
}

/**
 * 商户某渠道的抽佣情况。
 * configured=false 表示该渠道还没有进件记录，此时无法设置抽佣 ——
 * 没有 merchant_payment_config 行就没有可写的载体，后端会直接拒绝。
 */
export interface MerchantChannelCommission {
  channel: 'wechat' | 'alipay' | string
  /** 渠道中文名，后端下发 */
  channelLabel: string
  configured: boolean
  /** 抽佣比例，如 0.0038；null 表示未定价，0 表示已定价为不抽佣 */
  profitShareRate: number | null
  /** 该渠道进件状态，未进件时为 not_applied */
  status: string
}

export interface MerchantDetail extends MerchantListItem {
  updatedAt: string
  auditedAt: string | null
  auditRemark: string | null
  store: StoreBrief | null
  /** 按渠道的抽佣比例，固定含微信与支付宝两条 */
  commissions: MerchantChannelCommission[]
}

/** GET /platform/merchants 查询参数 */
export interface MerchantListParams extends PageQuery {
  status?: MerchantStatus
}

/** POST /platform/merchants：开通商户（同时创建老板账号与默认门店） */
export interface MerchantCreateInput {
  code: string
  name: string
  contactName: string
  contactPhone: string
  logo?: string
  remark?: string
  /** 'YYYY-MM-DD' 或 'YYYY-MM-DD HH:mm:ss'，空串表示不限期 */
  expireAt?: string
  adminUsername: string
  adminRealName: string
  adminPassword: string
}

/** PATCH /platform/merchants/{id}：商户编码与老板账号不可修改 */
export interface MerchantUpdateInput {
  name?: string
  contactName?: string
  contactPhone?: string
  logo?: string
  remark?: string
  expireAt?: string
  /**
   * 分渠道抽佣比例，形如 { wechat: 0.0038 }。
   * 不传该键 = 保持原值；传 null = 清除抽佣；只对已进件的渠道生效。
   */
  profitShareRates?: Partial<Record<'wechat' | 'alipay', number | null>>
}

/** PATCH /platform/merchants/{id}/status */
export interface MerchantStatusInput {
  status: MerchantStatus
}

/** GET /platform/merchants/expiring */
export interface ExpiringMerchant {
  id: number
  code: string
  name: string
  expireAt: string
  /** 剩余天数，负数表示已过期 */
  daysLeft: number
  status: MerchantStatus
}
