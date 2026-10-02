import { http } from './request'
import type { Promotion, PromotionInput, PromotionListParams, PromotionStatus } from './types/promotion'
import type { PageResult } from './types/common'

/** GET /merchant/promotions */
export function fetchPromotions(params: PromotionListParams): Promise<PageResult<Promotion>> {
  return http.get<PageResult<Promotion>>('/merchant/promotions', { ...params })
}

/** POST /merchant/promotions */
export function createPromotion(input: PromotionInput): Promise<Promotion> {
  return http.post<Promotion>('/merchant/promotions', input)
}

/** PATCH /merchant/promotions/{id} */
export function updatePromotion(id: number, input: PromotionInput): Promise<Promotion> {
  return http.patch<Promotion>(`/merchant/promotions/${id}`, input)
}

/** PATCH /merchant/promotions/{id}/status */
export function updatePromotionStatus(id: number, status: PromotionStatus): Promise<Promotion> {
  return http.patch<Promotion>(`/merchant/promotions/${id}/status`, { status })
}

/** DELETE /merchant/promotions/{id}，被运营位卡关联时后端返回 409 */
export function deletePromotion(id: number): Promise<null> {
  return http.delete<null>(`/merchant/promotions/${id}`)
}
