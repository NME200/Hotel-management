/**
 * 接口只用相对路径，dev 由 vite proxy 转发，生产由同域反代承接，禁止写死域名与端口。
 * 后端实际地址（IP/端口）只有一个地方：`src/request.ts`，proxy 从那里读。
 */
export const API_BASE_URL = '/api/v1'

export const REQUEST_TIMEOUT = 15000

export const DEFAULT_PAGE = 1
export const DEFAULT_PAGE_SIZE = 20
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export const APP_NAME = '收银台'

/** localStorage 键名，统一维护避免散落；前缀与商家端分开，同域部署时不会互相覆盖 */
export const STORAGE_KEYS = {
  accessToken: 'cm-web:access-token',
  refreshToken: 'cm-web:refresh-token',
  authUser: 'cm-web:auth-user',
}
