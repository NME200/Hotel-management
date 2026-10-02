import { http } from './request'
import type { OrderBrief, OrderDetail, OrderListParams, OrderStatusInput, OrderSummary } from './types/order'
import type { PageResult } from './types/common'

/** GET /merchant/orders */
export function fetchOrders(params: OrderListParams): Promise<PageResult<OrderBrief>> {
  return http.get<PageResult<OrderBrief>>('/merchant/orders', { ...params })
}

/** GET /merchant/orders/{id} */
export function fetchOrderDetail(id: number): Promise<OrderDetail> {
  return http.get<OrderDetail>(`/merchant/orders/${id}`)
}

/** PATCH /merchant/orders/{id}/status */
export function updateOrderStatus(id: number, input: OrderStatusInput): Promise<OrderDetail> {
  return http.patch<OrderDetail>(`/merchant/orders/${id}/status`, input)
}

/** GET /merchant/orders/summary */
export function fetchOrderSummary(params: { from?: string; to?: string }): Promise<OrderSummary> {
  return http.get<OrderSummary>('/merchant/orders/summary', { ...params })
}
