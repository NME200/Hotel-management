import { http } from './request'
import type { PageResult } from './types/common'
import type {
  CategoryItem,
  DishDetail,
  DishItem,
  OrderItem,
  OrderQuery,
  OrderSummary,
  UpdateOrderStatusInput,
} from './types/order'

/* ------------------------------ 点单素材 ------------------------------ */

/** 后端分页接口的 pageSize 上限（`PageQueryDto` 上写着 @Max(100)），超了会直接 400 */
const MAX_PAGE_SIZE = 100

/**
 * 按页捞到拿完为止。
 *
 * 收银台要的是「整店菜单一次看全」——翻页点菜会打断收银节奏，
 * 但后端的列表接口一律分页，所以这里替界面把分页吃掉。
 * `maxPages` 是兜底：万一 total 与实际条数不一致，也不至于无限打转。
 */
async function collectAllPages<T>(
  fetchPage: (page: number) => Promise<PageResult<T>>,
  maxPages = 10,
): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await fetchPage(page)
    items.push(...result.list)
    if (result.list.length === 0 || items.length >= result.total) break
  }
  return items
}

/** GET /merchant/categories —— 分页接口，收银台一次取全部分类 */
export function fetchCategories(): Promise<CategoryItem[]> {
  return collectAllPages((page) =>
    http.get<PageResult<CategoryItem>>('/merchant/categories', { page, pageSize: MAX_PAGE_SIZE }),
  )
}

/** GET /merchant/dishes —— 同上，一次取全在售菜品，分类与搜索在本地过滤 */
export function fetchDishes(params: { keyword?: string }): Promise<DishItem[]> {
  return collectAllPages((page) =>
    http.get<PageResult<DishItem>>('/merchant/dishes', {
      page,
      pageSize: MAX_PAGE_SIZE,
      ...(params.keyword ? { keyword: params.keyword } : {}),
    }),
  )
}

/** GET /merchant/dishes/{id} —— 规格与加料明细，只在需要选规格时拉 */
export function fetchDishDetail(id: number): Promise<DishDetail> {
  return http.get<DishDetail>(`/merchant/dishes/${id}`)
}

/* ------------------------------ 订单 ------------------------------ */

/** GET /merchant/orders */
export function fetchOrders(params: OrderQuery): Promise<PageResult<OrderItem>> {
  return http.get<PageResult<OrderItem>>('/merchant/orders', { ...params })
}

/** GET /merchant/orders/{id} */
export function fetchOrderDetail(id: number): Promise<OrderItem> {
  return http.get<OrderItem>(`/merchant/orders/${id}`)
}

/** GET /merchant/orders/summary */
export function fetchOrderSummary(params: OrderQuery): Promise<OrderSummary> {
  return http.get<OrderSummary>('/merchant/orders/summary', { ...params })
}

/** PATCH /merchant/orders/{id}/status —— 出餐流转与取消 */
export function updateOrderStatus(id: number, payload: UpdateOrderStatusInput): Promise<OrderItem> {
  return http.patch<OrderItem>(`/merchant/orders/${id}/status`, payload)
}
