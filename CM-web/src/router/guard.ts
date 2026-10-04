import type { Router } from 'vue-router'

import { APP_NAME } from '@/constants/api'
import { PERMISSION } from '@/constants/permission'
import { useAuthStore } from '@/stores/auth'
import { ROUTE_PATHS, safeRedirectPath } from './meta'

export function setupRouterGuard(router: Router): void {
  router.beforeEach(async (to) => {
    const auth = useAuthStore()

    // 已登录再访问登录页，直接回首页
    if (to.meta.requiresAuth === false) {
      if (to.path === ROUTE_PATHS.login && auth.isAuthenticated) {
        const redirect = safeRedirectPath(to.query.redirect)
        return { path: redirect ?? ROUTE_PATHS.home, replace: true }
      }
      return true
    }

    if (!auth.isAuthenticated) {
      return { path: ROUTE_PATHS.login, query: { redirect: to.fullPath } }
    }

    // 刷新后本地只有缓存的用户信息，向后端确认一次身份与权限
    if (!auth.profileLoaded) {
      const ok = await auth.loadProfile()
      if (!ok) return { path: ROUTE_PATHS.login, query: { redirect: to.fullPath } }
    }

    /**
     * 收银台是「只有收银权限的员工才能进」的前端。
     * 后端在登录时就挡过一次，这里再挡一次是为了兜住
     * 「把商家端/小程序拿到的令牌直接塞进本站」的情况 ——
     * 那种令牌能过 /auth/profile，但没有 cashier:use。
     */
    if (!auth.can(PERMISSION.cashierUse)) {
      auth.clearSession()
      return {
        path: ROUTE_PATHS.login,
        query: { denied: '1' },
        replace: true,
      }
    }

    if (!auth.hasPermission(to.meta.permissions)) {
      return { path: ROUTE_PATHS.forbidden }
    }

    return true
  })

  router.afterEach((to) => {
    document.title = to.meta.title ? `${to.meta.title} · ${APP_NAME}` : APP_NAME
  })
}
