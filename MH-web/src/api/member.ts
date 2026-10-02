import { http } from './request'
import type { Member, MemberListParams, MemberUpdateInput } from './types/member'
import type { PageResult } from './types/common'

/** GET /merchant/members */
export function fetchMembers(params: MemberListParams): Promise<PageResult<Member>> {
  return http.get<PageResult<Member>>('/merchant/members', { ...params })
}

/** GET /merchant/members/{id} */
export function fetchMemberDetail(id: number): Promise<Member> {
  return http.get<Member>(`/merchant/members/${id}`)
}

/** PATCH /merchant/members/{id} */
export function updateMember(id: number, input: MemberUpdateInput): Promise<Member> {
  return http.patch<Member>(`/merchant/members/${id}`, input)
}
