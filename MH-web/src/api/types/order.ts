import type { PageQuery } from './common'

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'refunded'

export type DineType = 'dine_in' | 'takeout' | 'pickup'

export interface OrderItem {
  id: number
  dishId: number | null
  dishName: string
  dishImage: string
  skuId: number | null
  specDesc: string
  unitPrice: number
  quantity: number
  totalAmount: number
  remark: string
}

export interface OrderBrief {
  id: number
  orderNo: string
  pickupCode: string
  memberId: number | null
  memberNickname: string
  dineType: DineType
  tableNo: string
  peopleCount: number
  status: OrderStatus
  dishAmount: number
  packingAmount: number
  deliveryAmount: number
  discountAmount: number
  payAmount: number
  remark: string
  items: OrderItem[]
  itemCount: number
  createdAt: string
  acceptedAt: string | null
  completedAt: string | null
}

/** 契约中订单详情与列表字段一致，详情接口返回完整 items */
export type OrderDetail = OrderBrief

export interface OrderListParams extends PageQuery {
  status?: OrderStatus
  dineType?: DineType
  from?: string
  to?: string
}

export interface OrderSummary {
  orderCount: number
  turnover: number
  pendingCount: number
  completedCount: number
  cancelledCount: number
}

export interface OrderStatusInput {
  status: OrderStatus
  remark?: string
}
