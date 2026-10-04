import { http } from './request'
import type {
  CloseTableInput,
  OpenTableInput,
  TableBatchCreateInput,
  TableBatchCreateResult,
  TableCreateInput,
  TableItem,
  TableStatus,
  TableUpdateInput,
} from './types/table'

/** GET /merchant/tables */
export function fetchTables(): Promise<TableItem[]> {
  return http.get<TableItem[]>('/merchant/tables')
}

/** POST /merchant/tables */
export function createTable(payload: TableCreateInput): Promise<TableItem> {
  return http.post<TableItem>('/merchant/tables', payload)
}

/** POST /merchant/tables/batch */
export function createTablesBatch(payload: TableBatchCreateInput): Promise<TableBatchCreateResult> {
  return http.post<TableBatchCreateResult>('/merchant/tables/batch', payload)
}

/** PATCH /merchant/tables/{id} */
export function updateTable(id: number, payload: TableUpdateInput): Promise<TableItem> {
  return http.patch<TableItem>(`/merchant/tables/${id}`, payload)
}

/** PATCH /merchant/tables/{id}/status */
export function updateTableStatus(id: number, status: TableStatus): Promise<TableItem> {
  return http.patch<TableItem>(`/merchant/tables/${id}/status`, { status })
}

/**
 * POST /merchant/tables/{id}/qrcode
 * 换一个 qr_token 重新制码 —— 已贴在桌上的旧码会立即失效。
 */
export function regenerateTableQrCode(id: number): Promise<TableItem> {
  return http.post<TableItem>(`/merchant/tables/${id}/qrcode`, {})
}

/** DELETE /merchant/tables/{id} */
export function removeTable(id: number): Promise<null> {
  return http.delete<null>(`/merchant/tables/${id}`)
}

/**
 * POST /merchant/tables/{id}/open —— 开台，把桌标记为「用餐中」。
 *
 * 开台不建订单：客人可能先坐下再点菜。收银台（CM-web）与本页面都能开台，
 * 走的是同一张 `store_table` 的同一个字段，不存在两处状态对不上的问题。
 */
export function openTable(id: number, payload: OpenTableInput = {}): Promise<TableItem> {
  return http.post<TableItem>(`/merchant/tables/${id}/open`, payload)
}

/** POST /merchant/tables/{id}/close —— 清台；桌上有未结账订单时后端会拒绝 */
export function closeTable(id: number, payload: CloseTableInput = {}): Promise<TableItem> {
  return http.post<TableItem>(`/merchant/tables/${id}/close`, payload)
}
