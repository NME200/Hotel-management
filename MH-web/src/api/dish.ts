import { http } from './request'
import type { DishBrief, DishDetail, DishInput, DishListParams, DishStatus } from './types/dish'
import type { PageResult } from './types/common'

/** GET /merchant/dishes */
export function fetchDishes(params: DishListParams): Promise<PageResult<DishBrief>> {
  return http.get<PageResult<DishBrief>>('/merchant/dishes', { ...params })
}

/** GET /merchant/dishes/{id} */
export function fetchDishDetail(id: number): Promise<DishDetail> {
  return http.get<DishDetail>(`/merchant/dishes/${id}`)
}

/** POST /merchant/dishes */
export function createDish(input: DishInput): Promise<DishBrief> {
  return http.post<DishBrief>('/merchant/dishes', input)
}

/** PATCH /merchant/dishes/{id} */
export function updateDish(id: number, input: DishInput): Promise<DishBrief> {
  return http.patch<DishBrief>(`/merchant/dishes/${id}`, input)
}

/** DELETE /merchant/dishes/{id} */
export function deleteDish(id: number): Promise<null> {
  return http.delete<null>(`/merchant/dishes/${id}`)
}

/** PATCH /merchant/dishes/{id}/status */
export function updateDishStatus(id: number, status: DishStatus): Promise<DishBrief> {
  return http.patch<DishBrief>(`/merchant/dishes/${id}/status`, { status })
}
