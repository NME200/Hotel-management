import type { PageQuery } from './common'
import type { StoreStatus } from './store'

export type PrintMode = 'browser' | 'cloud'
export type PrintTicketType = 'customer' | 'kitchen'
export type PrintPaperSize = '58mm' | '80mm'
export type PrintTaskStatus = 'pending' | 'success' | 'failed'
export type PrintTrigger = 'auto' | 'manual' | 'retry'
export type PrinterStatus = 'active' | 'disabled'
export type PrintProvider = 'feie' | 'yilianyun'

/** 打印机配置（后端 Printer 实体） */
export interface PrinterItem {
  id: number
  merchantId: number
  name: string
  mode: PrintMode
  ticketType: PrintTicketType
  paperSize: PrintPaperSize
  status: PrinterStatus
  copies: number
  provider: PrintProvider | null
  deviceNo: string | null
  remark: string | null
  createdAt: string
  updatedAt: string
}

/** POST /merchant/printers 请求体 */
export interface PrinterCreateInput {
  name: string
  mode: PrintMode
  ticketType: PrintTicketType
  paperSize: PrintPaperSize
  copies: number
  provider?: PrintProvider | null
  deviceNo?: string | null
  remark?: string | null
}

/** PATCH /merchant/printers/{id} 请求体，比新增多一个状态 */
export interface PrinterUpdateInput extends PrinterCreateInput {
  status: PrinterStatus
}

/** 打印任务流水（后端 PrintTask 实体） */
export interface PrintTaskItem {
  id: number
  merchantId: number
  orderId: number
  orderNo: string
  ticketType: PrintTicketType
  mode: PrintMode
  printerName: string | null
  copies: number
  status: PrintTaskStatus
  retryCount: number
  failReason: string | null
  trigger: PrintTrigger | null
  operatorId: number | null
  operatorName: string | null
  printedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PrintTaskQuery extends PageQuery {
  status?: PrintTaskStatus
  ticketType?: PrintTicketType
  orderNo?: string
  from?: string
  to?: string
}

export interface PrintTaskCreateInput {
  orderId: number
  ticketType?: PrintTicketType
  copies?: number
  printerId?: number
  trigger?: 'auto' | 'manual'
}

export interface PrintTaskReportInput {
  status: 'success' | 'failed'
  failReason?: string
}

/**
 * 一张小票的完整渲染数据。金额全部是「分」的整数，
 * 展示时一律经 formatMoney 换算，前端不做任何金额运算。
 */
export interface ReceiptLine {
  dishName: string
  specDesc: string
  quantity: number
  unitPriceCents: number
  totalCents: number
  remark: string
}

export interface ReceiptShop {
  name: string
  phone: string
  address: string
  logo: string
}

export interface ReceiptAmount {
  dishCents: number
  packingCents: number
  deliveryCents: number
  discountCents: number
  payCents: number
}

export interface ReceiptData {
  orderId: number
  orderNo: string
  pickupCode: string
  ticketType: PrintTicketType
  shop: ReceiptShop
  dineTypeLabel: string
  tableNo: string
  peopleCount: number
  memberNickname: string
  remark: string
  orderedAt: string
  printedAt: string
  lines: ReceiptLine[]
  itemCount: number
  copies: number
  paperSize: PrintPaperSize
  amount: ReceiptAmount
  showAmount: boolean
  footer: string
}

/** 门店设置里打印相关字段（StoreInfo 的打印子集） */
export interface StorePrintSettings {
  autoPrint: boolean
  autoPrintOn: 'accepted' | 'ready'
  customerCopies: number
}

/** 门店营业状态别处已定义，这里仅作 re-export 方便打印设置引用 */
export type { StoreStatus }
