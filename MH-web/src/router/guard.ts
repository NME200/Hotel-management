import type { Router } from 'vue-router'

import { APP_NAME } from '@/constants/api'
import { useAuthStore } from '@/stores/auth'
import { ROUTE_PATHS, safeRedirectPath } from './meta'
import { MENU_ROUTES } from './routes'

/**
 * 按权限挑一个能进的菜单页当落地页。
 *
 * 后厨与服务员没有 dashboard:read，写死跳 /dashboard 会让人登录后第一眼就是 403，
 * 看起来像登录失败。此时（守卫里）身份与权限已经从后端确认过了，判断是可靠的。
 */
function firstAccessibleMenu(): string {
  const auth = useAuthStore()
  const landing = MENU_ROUTES.find((route) => auth.hasPermission(route.meta?.permissions))
  return landing ? `/${String(landing.path)}` : ROUTE_PATHS.forbidden
}

export function setupRouterGuard(router: Router): void {
  router.beforeEach(async (to) => {
    const auth = useAuthStore()

    // 已登录再访问登录页，直接回首页（'/' 会按权限挑出真正的落地页）
    if (to.meta.requiresAuth === false) {
      if (to.path === ROUTE_PATHS.login && auth.isAuthenticated) {
        const redirect = safeRedirectPath(to.query.redirect)
        return { path: redirect ?? '/', replace: true }
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
      // 从站点根路径重定向过来的默认落地页：换个能进的页面，而不是把人丢进 403
      if (to.redirectedFrom?.path === '/') {
        const landing = firstAccessibleMenu()
        return landing === to.path ? { path: ROUTE_PATHS.forbidden } : { path: landing, replace: true }
      }
      return { path: ROUTE_PATHS.forbidden }
    }

    return true
  })

  router.afterEach((to) => {
    document.title = to.meta.title ? `${to.meta.title} · ${APP_NAME}` : APP_NAME
  })
}
