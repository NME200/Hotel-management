import { useLocalStorage } from '@vueuse/core'

import type { PlatformUser, TokenResult } from '@/api/types/auth'
import { STORAGE_KEYS } from '@/constants/api'

/**
 * 登录态的唯一持久化来源。
 * 放在普通模块（而非 Pinia）里，是为了让 axios 拦截器可以直接读写，
 * 避免 api <-> stores 的循环依赖；Pinia store 只做派生与动作编排。
 */
export const accessTokenStorage = useLocalStorage<string>(STORAGE_KEYS.accessToken, '')
export const refreshTokenStorage = useLocalStorage<string>(STORAGE_KEYS.refreshToken, '')
export const authUserStorage = useLocalStorage<PlatformUser | null>(STORAGE_KEYS.authUser, null)

export function saveSession(session: TokenResult): void {
  accessTokenStorage.value = session.accessToken
  refreshTokenStorage.value = session.refreshToken
  authUserStorage.value = session.user
}

/** 静默续期成功后只换 token，保留已缓存的用户信息 */
export function saveTokens(accessToken: string, refreshToken: string): void {
  accessTokenStorage.value = accessToken
  refreshTokenStorage.value = refreshToken
}

export function clearAuthStorage(): void {
  accessTokenStorage.value = ''
  refreshTokenStorage.value = ''
  authUserStorage.value = null
}
