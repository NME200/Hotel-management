import { http } from './request'
import type {
  MerchantStatistics,
  PlatformDish,
  PlatformDishListParams,
  PlatformMember,
  PlatformMemberListParams,
  PlatformOrder,
  PlatformOrderListParams,
  PlatformStaff,
  PlatformStaffListParams,
} from './types/merchant-insight'
import type { PageResult } from './types/common'

/**
 * 商户数据只读穿透（权限点 platform:merchant:view）：客服排障用，
 * 平台端不提供任何写接口，所以这里全部是 GET。
 */

/** GET /platform/merchants/{id}/statistics */
export function fetchMerchantStatistics(merchantId: number): Promise<MerchantStatistics> {
  return http.get<MerchantStatistics>(`/platform/merchants/${merchantId}/statistics`)
}

/** GET /platform/merchants/{id}/dishes */
export function fetchMerchantDishes(
  merchantId: number,
  params: PlatformDishListParams,
): Promise<PageResult<PlatformDish>> {
  return http.get<PageResult<PlatformDish>>(`/platform/merchants/${merchantId}/dishes`, { ...params })
}

/** GET /platform/merchants/{id}/orders */
export function fetchMerchantOrders(
  merchantId: number,
  params: PlatformOrderListParams,
): Promise<PageResult<PlatformOrder>> {
  return http.get<PageResult<PlatformOrder>>(`/platform/merchants/${merchantId}/orders`, { ...params })
}

/** GET /platform/merchants/{id}/members */
export function fetchMerchantMembers(
  merchantId: number,
  params: PlatformMemberListParams,
): Promise<PageResult<PlatformMember>> {
  return http.get<PageResult<PlatformMember>>(`/platform/merchants/${merchantId}/members`, { ...params })
}

/** GET /platform/merchants/{id}/staffs */
export function fetchMerchantStaffs(
  merchantId: number,
  params: PlatformStaffListParams,
): Promise<PageResult<PlatformStaff>> {
  return http.get<PageResult<PlatformStaff>>(`/platform/merchants/${merchantId}/staffs`, { ...params })
}
