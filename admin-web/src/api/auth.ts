import { http } from './request'
import type { LoginPayload, PlatformUser, TokenResult } from './types/auth'

/** POST /auth/platform/login */
export function login(payload: LoginPayload): Promise<TokenResult> {
  return http.post<TokenResult>('/auth/platform/login', payload, { skipAuth: true })
}

/** POST /auth/logout，通知后端作废 refreshToken；失败不弹提示，前端本地清理即可 */
export function logout(): Promise<null> {
  return http.post<null>('/auth/logout', undefined, { silent: true })
}

/** GET /auth/profile */
export function fetchProfile(): Promise<PlatformUser> {
  return http.get<PlatformUser>('/auth/profile')
}

/**
 * POST /auth/change-password 修改本人密码。
 * 后端会作废当前会话，成功后前端需清登录态并跳登录页。
 */
export function changePassword(payload: { oldPassword: string; newPassword: string }): Promise<null> {
  return http.post<null>('/auth/change-password', payload)
}
