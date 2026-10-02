import type { PageQuery } from './common'

export type PromotionStatus = 'enabled' | 'disabled'

/** 优惠算法，与后端 PromotionType 同一组机器码 */
export type PromotionType = 'price' | 'discount'

/** 适用范围复用优惠券的三档，商家在两个模块里的选法是一样的 */
export type PromotionScopeType = 'all' | 'category' | 'dish'

export interface Promotion {
  id: number
  merchantId: number
  name: string
  /** 顾客端角标文字，空表示用默认的「活动」 */
  badge: string | null
  type: PromotionType
  /** 活动价，单位「分」，type=price 时才有值 */
  priceCents: number | null
  /** 实付比例。decimal 列下发的是字符串（如 "0.6000" 表示 6 折） */
  discountRatio: string | null
  scopeType: PromotionScopeType
  scopeIds: number[] | null
  startsAt: string | null
  endsAt: string | null
  status: PromotionStatus
  createdAt: string
}

/**
 * POST /merchant/promotions 与 PATCH /merchant/promotions/{id} 的请求体。
 * 金额按「元」发（后端换算成分），比例按 number 发，与实体上的存储口径不同。
 */
export interface PromotionInput {
  name: string
  badge?: string | null
  type?: PromotionType
  price?: number | null
  discount?: number | null
  scopeType?: PromotionScopeType
  scopeIds?: number[] | null
  startsAt?: string | null
  endsAt?: string | null
  status?: PromotionStatus
}

export interface PromotionListParams extends PageQuery {
  status?: PromotionStatus
}
