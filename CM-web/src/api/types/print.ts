import type { PageQuery } from './common'

export type PrintMode = 'browser' | 'cloud'
export type PrintTicketType = 'customer' | 'kitchen'
export type PrintPaperSize = '58mm' | '80mm'
export type PrintTaskStatus = 'pending' | 'success' | 'failed'
export type PrintTrigger = 'auto' | 'manual' | 'retry'

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
