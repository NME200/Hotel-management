import { http } from './request'
import type { Category, CategoryInput, CategoryListParams } from './types/category'
import type { PageResult } from './types/common'

/** GET /merchant/categories */
export function fetchCategories(params: CategoryListParams): Promise<PageResult<Category>> {
  return http.get<PageResult<Category>>('/merchant/categories', { ...params })
}

/** POST /merchant/categories */
export function createCategory(input: CategoryInput): Promise<Category> {
  return http.post<Category>('/merchant/categories', input)
}

/** PATCH /merchant/categories/{id} */
export function updateCategory(id: number, input: CategoryInput): Promise<Category> {
  return http.patch<Category>(`/merchant/categories/${id}`, input)
}

/** DELETE /merchant/categories/{id} */
export function deleteCategory(id: number): Promise<null> {
  return http.delete<null>(`/merchant/categories/${id}`)
}
