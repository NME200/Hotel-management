import type { PageQuery } from './common'

/* ------------------------- 字面量联合（与后端枚举一一对应） ------------------------- */

export type DishStatus = 'on_sale' | 'off_sale'

export type DishStockType = 'unlimited' | 'fixed'

export type OrderStatus = 'pending' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'refunded'

export type DineType = 'dine_in' | 'takeout' | 'pickup'

export type MemberLevel = 'normal' | 'silver' | 'gold' | 'vip'

export type MemberGender = 'unknown' | 'male' | 'female'

export type MemberStatus = 'active' | 'disabled'

export type StaffRole = 'owner' | 'manager' | 'cashier' | 'kitchen' | 'waiter'

export type StaffStatus = 'active' | 'disabled'

/** GET /platform/merchants/{id}/statistics */
export interface MerchantStatistics {
  dishCount: number
  orderCount: number
  memberCount: number
  staffCount: number
  totalTurnover: number
  last7Orders: number
}

/** 只读穿透接口的商户 id 走路径参数，不进 query 对象 */

/* --------------------------------- 菜品 --------------------------------- */

export interface PlatformDish {
  id: number
  categoryId: number
  categoryName: string
  name: string
  subtitle: string | null
  image: string | null
  price: number
  memberPrice: number | null
  status: DishStatus
  salesCount: number
  stockType: DishStockType
  stock: number | null
  sort: number
  isRecommend: boolean
  createdAt: string
}

export interface PlatformDishListParams extends PageQuery {
  status?: DishStatus
}

/* --------------------------------- 订单 --------------------------------- */

export interface PlatformOrderItem {
  id: number
  dishId: number | null
  dishName: string
  dishImage: string | null
  skuId: number | null
  specDesc: string | null
  unitPrice: number
  quantity: number
  totalAmount: number
  remark: string | null
}

export interface PlatformOrder {
  id: number
  orderNo: string
  pickupCode: string | null
  memberId: number | null
  memberNickname: string | null
  dineType: DineType
  status: OrderStatus
  tableNo: string | null
  peopleCount: number
  dishAmount: number
  packingAmount: number
  deliveryAmount: number
  discountAmount: number
  payAmount: number
  remark: string | null
  items: PlatformOrderItem[]
  itemCount: number
  createdAt: string
  acceptedAt: string | null
  completedAt: string | null
}

export interface PlatformOrderListParams extends PageQuery {
  status?: OrderStatus
  dineType?: DineType
  from?: string
  to?: string
}

/* --------------------------------- 会员 --------------------------------- */

export interface PlatformMember {
  id: number
  nickname: string
  avatar: string | null
  phone: string
  gender: MemberGender
  level: MemberLevel
  points: number
  balance: number
  totalAmount: number
  orderCount: number
  remark: string | null
  status: MemberStatus
  lastOrderAt: string | null
  createdAt: string
}

export interface PlatformMemberListParams extends PageQuery {
  level?: MemberLevel
  status?: MemberStatus
}

/* --------------------------------- 员工 --------------------------------- */

export interface PlatformStaff {
  id: number
  username: string
  realName: string
  phone: string | null
  role: StaffRole
  status: StaffStatus
  lastLoginAt: string | null
  createdAt: string
}

export interface PlatformStaffListParams extends PageQuery {
  role?: StaffRole
}
