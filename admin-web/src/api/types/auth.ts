/** 平台账号角色 */
export type PlatformRole = 'platform_admin' | 'platform_operator'

export interface PlatformUser {
  id: number
  username: string
  realName: string
  userType: 'platform'
  merchantId: null
  merchantName: null
  role: PlatformRole
  permissions: string[]
}

/** POST /auth/platform/login 请求体：平台端无商户号 */
export interface LoginPayload {
  username: string
  password: string
}

export interface TokenResult {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: PlatformUser
}
