import { http } from './request'
import type { StoreInfo, StoreUpdateInput } from './types/store'

/** GET /merchant/store */
export function fetchStore(): Promise<StoreInfo> {
  return http.get<StoreInfo>('/merchant/store')
}

/** PUT /merchant/store */
export function updateStore(payload: StoreUpdateInput): Promise<StoreInfo> {
  return http.put<StoreInfo>('/merchant/store', payload)
}
