import type { Router } from 'vue-router'

import { APP_NAME } from '@/constants/api'
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

    if (!auth.hasPermission(to.meta.permissions)) {
      return { path: ROUTE_PATHS.forbidden }
    }

    return true
  })

  router.afterEach((to) => {
    document.title = to.meta.title ? `${to.meta.title} · ${APP_NAME}` : APP_NAME
  })
}
