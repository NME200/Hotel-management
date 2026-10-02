/** 接口只用相对路径，dev 由 vite proxy 转发，生产由同域反代承接，禁止写死域名与端口 */
export const API_BASE_URL = '/api/v1'

export const REQUEST_TIMEOUT = 15000

export const DEFAULT_PAGE = 1
export const DEFAULT_PAGE_SIZE = 20
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export const APP_NAME = '商家中心'

/** localStorage 键名，统一维护避免散落 */
export const STORAGE_KEYS = {
  accessToken: 'mh-web:access-token',
  refreshToken: 'mh-web:refresh-token',
  authUser: 'mh-web:auth-user',
  sidebarCollapsed: 'mh-web:sidebar-collapsed',
}
