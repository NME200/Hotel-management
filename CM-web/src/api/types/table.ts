import type { TableDiningStatus, TableStatus } from './order'

/** 桌位（后端 StoreTable 实体） */
export interface TableItem {
  id: number
  merchantId: number
  tableNo: string
  qrToken: string
  qrCodeUrl: string | null
  area: string | null
  seats: number | null
  status: TableStatus
  sort: number
  /** 用餐状态：收银台看板按它区分空闲/用餐中 */
  diningStatus: TableDiningStatus
  guestCount: number | null
  openedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface OpenTableInput {
  guestCount?: number | null
}

export interface CloseTableInput {
  /** 桌上有未结账订单时默认拒绝，确需清台（顾客跑单）才传 true */
  force?: boolean
}
