import { http } from './request'
import type {
  PrintTaskCreateInput,
  PrintTaskItem,
  PrintTaskReportInput,
  PrintTicketType,
  ReceiptData,
} from './types/print'

/** GET /merchant/orders/{id}/receipt —— 小票数据由后端算好，前端只渲染版面 */
export function fetchReceipt(
  orderId: number,
  ticketType: PrintTicketType = 'customer',
): Promise<ReceiptData> {
  return http.get<ReceiptData>(`/merchant/orders/${orderId}/receipt`, { ticketType })
}

/** POST /merchant/print/tasks —— 先落任务再出纸，中途崩了流水里也留得下痕迹 */
export function createPrintTask(payload: PrintTaskCreateInput): Promise<PrintTaskItem> {
  return http.post<PrintTaskItem>('/merchant/print/tasks', payload)
}

/** GET /merchant/print/tasks/order/{orderId} */
export function fetchPrintTasksByOrder(orderId: number): Promise<PrintTaskItem[]> {
  return http.get<PrintTaskItem[]>(`/merchant/print/tasks/order/${orderId}`)
}

/** PATCH /merchant/print/tasks/{id}/report —— 浏览器出纸后回执 */
export function reportPrintTask(id: number, payload: PrintTaskReportInput): Promise<PrintTaskItem> {
  return http.patch<PrintTaskItem>(`/merchant/print/tasks/${id}/report`, payload)
}

/** PATCH /merchant/print/tasks/{id}/retry */
export function retryPrintTask(id: number): Promise<PrintTaskItem> {
  return http.patch<PrintTaskItem>(`/merchant/print/tasks/${id}/retry`, {})
}
