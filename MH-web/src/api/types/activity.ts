import type { PageQuery } from './common'

export type ActivityStatus = 'enabled' | 'disabled'

/** 展示位，与后端 ActivitySlot 同一组机器码 */
export type ActivitySlot = 'home' | 'mine' | 'member'

/** 顾客端点击卡片后的跳转目标，与后端 ActivityAction 同一组机器码 */
export type ActivityAction = 'none' | 'coupons' | 'menu' | 'member' | 'promotion' | 'stores' | 'search'

export interface Activity {
  id: number
  merchantId: number
  name: string
  slot: ActivitySlot
  title: string
  subTitle: string | null
  icon: string | null
  action: ActivityAction
  /** action=promotion 时指向被关联的限时活动，其余跳转为 null */
  promotionId: number | null
  startsAt: string | null
  endsAt: string | null
  status: ActivityStatus
  sort: number
  createdAt: string
}

export interface ActivityInput {
  name: string
  slot: ActivitySlot
  title: string
  subTitle?: string | null
  icon?: string | null
  action?: ActivityAction
  promotionId?: number | null
  startsAt?: string | null
  endsAt?: string | null
  status?: ActivityStatus
  sort?: number
}

export interface ActivityListParams extends PageQuery {
  slot?: ActivitySlot
  status?: ActivityStatus
}
