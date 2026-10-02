import type { PlatformRole } from './auth'
import type { PageQuery } from './common'

export type AccountStatus = 'active' | 'disabled'

/** GET /platform/accounts 列表项（role 与平台账号角色一致） */
export interface PlatformAccount {
  id: number
  username: string
  realName: string
  phone: string | null
  role: PlatformRole
  status: AccountStatus
  createdAt: string
  updatedAt: string
}

/** GET /platform/accounts 的 query：只有通用的 page/pageSize/keyword */
export type AccountListParams = PageQuery

/** POST /platform/accounts */
export interface AccountCreateInput {
  username: string
  password: string
  realName: string
  phone?: string
  role: PlatformRole
}

/** PATCH /platform/accounts/{id}，password 传了即为重置密码 */
export interface AccountUpdateInput {
  realName?: string
  phone?: string
  role?: PlatformRole
  status?: AccountStatus
  password?: string
}
