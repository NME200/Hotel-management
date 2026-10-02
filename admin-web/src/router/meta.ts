import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** 页面标题，用于侧边菜单、面包屑与 document.title */
    title?: string
    /** 是否需要登录，默认需要；登录页与静态错误页显式置 false */
    requiresAuth?: boolean
    /** 进入该页面需要的权限项，全部满足才放行 */
    permissions?: string[]
  }
}

export const ROUTE_PATHS = {
  login: '/login',
  forbidden: '/403',
  home: '/dashboard',
  merchants: '/merchant',
} as const

/** 只接受站内相对路径，避免登录后的 redirect 参数被用来跳转到外部站点 */
export function safeRedirectPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  return raw
}
