import { http } from './request'
import type {
  CustomerDetail,
  CustomerListParams,
  CustomerRow,
  CustomerStatusInput,
  MemberProfileInput,
  MemberProfileRow,
  MemberStatus,
  ProfileListParams,
} from './types/member'
import type { PageResult } from './types/common'

/**
 * 平台端会员管理，两层各一组接口：
 * customer 是跨门店的微信账号（停用即全平台不能下单），
 * member 是他在某一家店的档案（等级 / 成长值 / 余额 / 备注都只属于那一家）。
 * 商家端已不再提供会员接口，这两层的写操作只在这里发生。
 */

/** GET /platform/members 顾客账号列表，keyword 命中昵称 / 手机号 / openid */
export function fetchCustomers(params: CustomerListParams): Promise<PageResult<CustomerRow>> {
  return http.get<PageResult<CustomerRow>>('/platform/members', { ...params })
}

/** GET /platform/members/profiles 各店会员档案列表 */
export function fetchProfiles(params: ProfileListParams): Promise<PageResult<MemberProfileRow>> {
  return http.get<PageResult<MemberProfileRow>>('/platform/members/profiles', { ...params })
}

/** GET /platform/members/{id} 顾客详情：账号信息 + 他在每家店的档案 */
export function fetchCustomerDetail(id: number): Promise<CustomerDetail> {
  return http.get<CustomerDetail>(`/platform/members/${id}`)
}

/** PATCH /platform/members/{id} 平台级停用 / 恢复整个微信账号（全部门店生效） */
export function updateCustomerStatus(id: number, status: MemberStatus): Promise<CustomerRow> {
  const input: CustomerStatusInput = { status }
  return http.patch<CustomerRow>(`/platform/members/${id}`, input)
}

/** PATCH /platform/members/profile/{id} 改这一家店的备注 / 启停这一家 */
export function updateMemberProfile(id: number, input: MemberProfileInput): Promise<MemberProfileRow> {
  return http.patch<MemberProfileRow>(`/platform/members/profile/${id}`, input)
}
