import type { PageQuery } from './common'
import type { StaffRole } from './auth'

export type { StaffRole }

export type StaffStatus = 'active' | 'disabled'

export interface Staff {
  id: number
  username: string
  realName: string
  phone: string
  role: StaffRole
  status: StaffStatus
  lastLoginAt: string | null
  createdAt: string
}

/** POST /merchant/staffs */
export interface StaffCreateInput {
  username: string
  password: string
  realName: string
  phone?: string
  role: StaffRole
  status?: StaffStatus
}

/** PATCH /merchant/staffs/{id} */
export interface StaffUpdateInput {
  realName?: string
  phone?: string
  role?: StaffRole
  status?: StaffStatus
}

export interface StaffListParams extends PageQuery {
  role?: StaffRole
}
