export type StaffRole = 'owner' | 'manager' | 'cashier' | 'kitchen' | 'waiter'

export type UserType = 'platform' | 'merchant'

export interface AuthUser {
  id: number
  username: string
  realName: string
  userType: UserType
  merchantId: number | null
  merchantName: string | null
  role: StaffRole
  permissions: string[]
}

export interface LoginPayload {
  merchantCode: string
  username: string
  password: string
}

export interface TokenResult {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: AuthUser
}

/** 收银台角色的展示名，登录页与顶栏用它告诉收银员「你是谁」 */
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  owner: '店主',
  manager: '店长',
  cashier: '收银员',
  kitchen: '后厨',
  waiter: '服务员',
}
