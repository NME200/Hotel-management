import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { fetchProfile, login as loginRequest, logout as logoutRequest } from '@/api/auth'
import type { LoginPayload, PlatformUser } from '@/api/types/auth'
import { PLATFORM_ROLE_DICT, dictLabel } from '@/constants/dictionary'
import { hasAllPermissions, matchPermission } from '@/constants/permission'
import { accessTokenStorage, authUserStorage, clearAuthStorage, saveSession } from '@/utils/auth-storage'

export const useAuthStore = defineStore('auth', () => {
  /** 登录态派生自 utils/auth-storage（VueUse useLocalStorage），保证刷新后仍在 */
  const user = computed<PlatformUser | null>(() => authUserStorage.value)
  const accessToken = computed(() => accessTokenStorage.value)
  const isAuthenticated = computed(() => accessTokenStorage.value !== '')
  const permissions = computed<string[]>(() => user.value?.permissions ?? [])
  const displayName = computed(() => user.value?.realName || user.value?.username || '--')
  const roleLabel = computed(() => (user.value ? dictLabel(PLATFORM_ROLE_DICT, user.value.role) : '--'))
  const isAdmin = computed(() => user.value?.role === 'platform_admin')

  /** 本次会话是否已从后端确认过身份，路由守卫据此决定是否拉取 /auth/profile */
  const profileLoaded = ref(false)

  async function login(payload: LoginPayload): Promise<PlatformUser> {
    const session = await loginRequest(payload)
    saveSession(session)
    profileLoaded.value = true
    return session.user
  }

  async function loadProfile(): Promise<boolean> {
    try {
      authUserStorage.value = await fetchProfile()
      profileLoaded.value = true
      return true
    } catch {
      return false
    }
  }

  function clearSession(): void {
    clearAuthStorage()
    profileLoaded.value = false
  }

  async function logout(): Promise<void> {
    try {
      await logoutRequest()
    } catch {
      // 后端作废失败不影响本地登出
    } finally {
      clearSession()
    }
  }

  /** 单个权限或权限集合的校验，支持后端可能出现的 `merchant:*` 通配 */
  function hasPermission(required?: string | readonly string[]): boolean {
    if (!required || (Array.isArray(required) && required.length === 0)) return true
    if (!user.value) return false
    const list = Array.isArray(required) ? required : [required]
    return hasAllPermissions(permissions.value, list)
  }

  function can(code: string): boolean {
    return matchPermission(permissions.value, code)
  }

  return {
    user,
    accessToken,
    isAuthenticated,
    permissions,
    displayName,
    roleLabel,
    isAdmin,
    profileLoaded,
    login,
    loadProfile,
    logout,
    clearSession,
    hasPermission,
    can,
  }
})
