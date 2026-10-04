import { http } from './request'
import type { PageResult } from './types/common'
import type {
  PrinterCreateInput,
  PrinterItem,
  PrinterStatus,
  PrinterUpdateInput,
  PrintTaskCreateInput,
  PrintTaskItem,
  PrintTaskQuery,
  PrintTaskReportInput,
  PrintTicketType,
  ReceiptData,
} from './types/print'

/* ------------------------------ 打印机配置 ------------------------------ */

/** GET /merchant/printers */
export function fetchPrinters(): Promise<PrinterItem[]> {
  return http.get<PrinterItem[]>('/merchant/printers')
}

/** POST /merchant/printers */
export function createPrinter(payload: PrinterCreateInput): Promise<PrinterItem> {
  return http.post<PrinterItem>('/merchant/printers', payload)
}

/** PATCH /merchant/printers/{id} */
export function updatePrinter(id: number, payload: PrinterUpdateInput): Promise<PrinterItem> {
  return http.patch<PrinterItem>(`/merchant/printers/${id}`, payload)
}

/** PATCH /merchant/printers/{id}/status */
export function updatePrinterStatus(id: number, status: PrinterStatus): Promise<PrinterItem> {
  return http.patch<PrinterItem>(`/merchant/printers/${id}/status`, { status })
}

/** DELETE /merchant/printers/{id} */
export function removePrinter(id: number): Promise<null> {
  return http.delete<null>(`/merchant/printers/${id}`)
}

/* ------------------------------ 小票与打印任务 ------------------------------ */

/** GET /merchant/orders/{id}/receipt */
export function fetchReceipt(
  orderId: number,
  ticketType: PrintTicketType = 'customer',
): Promise<ReceiptData> {
  return http.get<ReceiptData>(`/merchant/orders/${orderId}/receipt`, { ticketType })
}

/** POST /merchant/print/tasks */
export function createPrintTask(payload: PrintTaskCreateInput): Promise<PrintTaskItem> {
  return http.post<PrintTaskItem>('/merchant/print/tasks', payload)
}

/** GET /merchant/print/tasks */
export function fetchPrintTasks(params: PrintTaskQuery): Promise<PageResult<PrintTaskItem>> {
  return http.get<PageResult<PrintTaskItem>>('/merchant/print/tasks', { ...params })
}

/** GET /merchant/print/tasks/order/{orderId} */
export function fetchPrintTasksByOrder(orderId: number): Promise<PrintTaskItem[]> {
  return http.get<PrintTaskItem[]>(`/merchant/print/tasks/order/${orderId}`)
}

/** PATCH /merchant/print/tasks/{id}/report */
export function reportPrintTask(id: number, payload: PrintTaskReportInput): Promise<PrintTaskItem> {
  return http.patch<PrintTaskItem>(`/merchant/print/tasks/${id}/report`, payload)
}

/** PATCH /merchant/print/tasks/{id}/retry */
export function retryPrintTask(id: number): Promise<PrintTaskItem> {
  return http.patch<PrintTaskItem>(`/merchant/print/tasks/${id}/retry`, {})
}
