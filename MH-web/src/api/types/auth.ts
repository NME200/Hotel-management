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
