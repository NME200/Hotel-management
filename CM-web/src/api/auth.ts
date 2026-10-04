import { http } from './request'
import type { AuthUser, LoginPayload, TokenResult } from './types/auth'

/**
 * POST /auth/cashier/login
 *
 * 收银台走专属登录入口：与商家端同一套账号密码，但后端会额外校验
 * `cashier:use` 权限，没有这个权限的员工（例如后厨）会被 403 拒绝，
 * 提示语由后端给出，前端直接展示。
 */
export function login(payload: LoginPayload): Promise<TokenResult> {
  return http.post<TokenResult>('/auth/cashier/login', payload, { skipAuth: true })
}

/** POST /auth/logout，通知后端作废 refreshToken；失败不弹提示，前端本地清理即可 */
export function logout(): Promise<null> {
  return http.post<null>('/auth/logout', undefined, { silent: true })
}

/** GET /auth/profile */
export function fetchProfile(): Promise<AuthUser> {
  return http.get<AuthUser>('/auth/profile')
}
