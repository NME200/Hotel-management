/* ------------------------- 字面量联合（与后端枚举一一对应） ------------------------- */

export type MemberLevel = 'normal' | 'silver' | 'gold' | 'vip'

export type MemberGender = 'unknown' | 'male' | 'female'

/**
 * active 正常 / disabled 停用。
 * 同一个字面量用在两层上，含义不同：顾客账号停用 = 全平台不能下单，
 * 门店档案停用 = 只挡那一家店，他在别的店照旧。
 */
export type MemberStatus = 'active' | 'disabled'

/** 注册来源：后端 customer.register_source 目前只写 mini_program */
export type RegisterSource = 'mini_program'

/**
 * 顾客账号行：微信身份（跨门店）+ 跨店汇总。
 * 余额不在此汇总——那是各商户自己的负债，加总没有意义。
 */
export interface CustomerRow {
  id: number
  nickname: string
  /** 完整手机号只在详情接口里给，列表用 phoneMasked */
  phone: string | null
  phoneMasked: string | null
  avatar: string | null
  gender: MemberGender
  status: MemberStatus
  registerSource: RegisterSource
  createdAt: string
  /** 在几家店开过会员档案 */
  storeCount: number
  /** 跨店累计订单数 */
  orderCount: number
  lastOrderAt: string | null
}

/** 一家店里的会员档案：等级、成长值、余额都是这一家自己的 */
export interface MemberProfileRow {
  id: number
  merchantId: number
  merchantName: string
  merchantCode: string
  customerId: number
  nickname: string
  level: MemberLevel
  /** 等级中文名由后端下发（MEMBER_LEVEL_RULES），前端文案只做兜底，展示一律以它为准 */
  levelLabel: string
  growthValue: number
  points: number
  balance: number
  totalAmount: number
  orderCount: number
  status: MemberStatus
  remark: string | null
  lastOrderAt: string | null
}

/** GET /platform/members/{id}：账号信息 + 他在每家店的档案 */
export interface CustomerDetail extends CustomerRow {
  profiles: MemberProfileRow[]
}

/** GET /platform/members：keyword 命中昵称 / 手机号 / openid */
export interface CustomerListParams {
  page?: number
  pageSize?: number
  keyword?: string
  status?: MemberStatus
}

/** GET /platform/members/profiles：档案接口没有关键字检索，按店 / 顾客 / 等级 / 状态筛 */
export interface ProfileListParams {
  page?: number
  pageSize?: number
  merchantId?: number
  customerId?: number
  level?: MemberLevel
  status?: MemberStatus
}

/** PATCH /platform/members/{id} */
export interface CustomerStatusInput {
  status: MemberStatus
}

/** PATCH /platform/members/profile/{id}：不传的字段保持原值 */
export interface MemberProfileInput {
  remark?: string
  status?: MemberStatus
}
