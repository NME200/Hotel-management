import { http } from './request'
import type { CloseTableInput, OpenTableInput, TableItem } from './types/table'

/** GET /merchant/tables —— 收银台看板与选桌都用这一份列表 */
export function fetchTables(): Promise<TableItem[]> {
  return http.get<TableItem[]>('/merchant/tables')
}

/** POST /merchant/tables/{id}/open —— 开台，登记人数 */
export function openTable(id: number, payload: OpenTableInput = {}): Promise<TableItem> {
  return http.post<TableItem>(`/merchant/tables/${id}/open`, payload)
}

/**
 * POST /merchant/tables/{id}/close —— 清台。
 * 桌上有未结账订单时后端会拒绝并说明原因；确需清台传 force。
 */
export function closeTable(id: number, payload: CloseTableInput = {}): Promise<TableItem> {
  return http.post<TableItem>(`/merchant/tables/${id}/close`, payload)
}
