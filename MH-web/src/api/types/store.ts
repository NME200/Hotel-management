export type StoreStatus = 'open' | 'closed'

/** 门店信息（后端字段 Store，前端类型名加 Info 避免与 DOM Store 混淆） */
export interface StoreInfo {
  id: number
  merchantId: number
  name: string
  logo: string | null
  province: string | null
  city: string | null
  district: string | null
  address: string | null
  longitude: number | null
  latitude: number | null
  phone: string | null
  notice: string | null
  /** 营业时段，形如 ["10:00-14:00", "17:00-21:00"] */
  businessHours: string[]
  status: StoreStatus
  createdAt: string
  updatedAt: string
}

/** PATCH /merchant/store 的请求体：除 id / merchantId 外的全部字段 */
export type StoreUpdateInput = Omit<StoreInfo, 'id' | 'merchantId' | 'createdAt' | 'updatedAt'>
