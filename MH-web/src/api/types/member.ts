import type { PageQuery } from './common'

export type MemberLevel = 'normal' | 'silver' | 'gold' | 'vip'

export type MemberStatus = 'active' | 'disabled'

export type MemberGender = 'unknown' | 'male' | 'female'

export interface Member {
  id: number
  nickname: string
  avatar: string
  phone: string
  gender: MemberGender
  level: MemberLevel
  points: number
  balance: number
  totalAmount: number
  orderCount: number
  remark: string
  status: MemberStatus
  lastOrderAt: string | null
  createdAt: string
}

/** PATCH /merchant/members/{id} */
export interface MemberUpdateInput {
  remark?: string
  status?: MemberStatus
  level?: MemberLevel
}

export interface MemberListParams extends PageQuery {
  level?: MemberLevel
  status?: MemberStatus
}
