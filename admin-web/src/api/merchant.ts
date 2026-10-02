import { http } from './request'
import type {
  ExpiringMerchant,
  MerchantCreateInput,
  MerchantDetail,
  MerchantListItem,
  MerchantListParams,
  MerchantStatus,
  MerchantUpdateInput,
} from './types/merchant'
import type { PageResult } from './types/common'

/** GET /platform/merchants */
export function fetchMerchants(params: MerchantListParams): Promise<PageResult<MerchantListItem>> {
  return http.get<PageResult<MerchantListItem>>('/platform/merchants', { ...params })
}

/** GET /platform/merchants/{id} */
export function fetchMerchantDetail(id: number): Promise<MerchantDetail> {
  return http.get<MerchantDetail>(`/platform/merchants/${id}`)
}

/** POST /platform/merchants 开通商户（同时创建老板账号与默认门店，初始状态 pending_audit） */
export function createMerchant(input: MerchantCreateInput): Promise<MerchantDetail> {
  return http.post<MerchantDetail>('/platform/merchants', input)
}

/** PATCH /platform/merchants/{id} 修改商户资料 */
export function updateMerchant(id: number, input: MerchantUpdateInput): Promise<MerchantDetail> {
  return http.patch<MerchantDetail>(`/platform/merchants/${id}`, input)
}

/** PATCH /platform/merchants/{id}/status 审核通过 / 停用 / 恢复 */
export function updateMerchantStatus(id: number, status: MerchantStatus): Promise<MerchantDetail> {
  return http.patch<MerchantDetail>(`/platform/merchants/${id}/status`, { status })
}

/** GET /platform/merchants/expiring?days= 到期预警列表 */
export function fetchExpiringMerchants(days: number): Promise<ExpiringMerchant[]> {
  return http.get<ExpiringMerchant[]>('/platform/merchants/expiring', { days })
}
