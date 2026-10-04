export type TableStatus = 'active' | 'disabled'

/** 用餐状态：与「启用/停用」正交 —— 一张桌可以正在用餐同时被临时停用 */
export type TableDiningStatus = 'idle' | 'dining'

/** 桌位（后端 StoreTable 实体）。qrToken 是扫码凭据，改桌号不会换掉它。 */
export interface TableItem {
  id: number
  merchantId: number
  tableNo: string
  qrToken: string
  /** 小程序码地址；制码失败时为 null，列表里显示「未生成」 */
  qrCodeUrl: string | null
  area: string | null
  seats: number | null
  status: TableStatus
  sort: number
  diningStatus: TableDiningStatus
  /** 开台时登记的就餐人数 */
  guestCount: number | null
  /** 开台时间，看板据此算用餐时长；清台后回到 null */
  openedAt: string | null
  createdAt: string
  updatedAt: string
}

/** POST /merchant/tables 请求体 */
export interface TableCreateInput {
  tableNo: string
  area?: string | null
  seats?: number | null
  sort?: number
}

/** PATCH /merchant/tables/{id} 请求体，比新增多一个状态 */
export interface TableUpdateInput extends TableCreateInput {
  status: TableStatus
}

/** POST /merchant/tables/batch 请求体：前缀 + 序号一次建一批 */
export interface TableBatchCreateInput {
  prefix?: string
  startNo: number
  count: number
  padLength?: number
  area?: string | null
  seats?: number | null
}

/** 批量建桌结果：skipped 是被重名跳过的桌号，需要提示给商家 */
export interface TableBatchCreateResult {
  created: TableItem[]
  skipped: string[]
}

/** POST /merchant/tables/{id}/open 请求体 */
export interface OpenTableInput {
  guestCount?: number | null
}

/** POST /merchant/tables/{id}/close 请求体 */
export interface CloseTableInput {
  /** 桌上有未结账订单时后端默认拒绝，确需清台（顾客跑单）才传 true */
  force?: boolean
}
