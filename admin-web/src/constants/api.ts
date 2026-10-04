/**
 * 接口只用相对路径，dev 由 vite proxy 转发，生产由同域反代承接，禁止写死域名与端口。
 * 后端实际地址（IP/端口）只有一个地方：`src/request.ts`，proxy 从那里读。
 */
export const API_BASE_URL = '/api/v1'

export const REQUEST_TIMEOUT = 15000

export const DEFAULT_PAGE = 1
export const DEFAULT_PAGE_SIZE = 20
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export const APP_NAME = '平台管理后台'

/**
 * 后端对已配置密钥下发的固定掩码（支付渠道密钥与小程序 AppSecret 共用，后端同名常量 SECRET_MASK）。
 * 提交时输入值等于它即代表「不修改」，绝不能把掩码本身当成真实密钥上报（详见支付渠道配置对话框）。
 */
export const PAYMENT_SECRET_MASK = '********'

/** localStorage 键名，统一维护避免散落 */
export const STORAGE_KEYS = {
  accessToken: 'admin-web:access-token',
  refreshToken: 'admin-web:refresh-token',
  authUser: 'admin-web:auth-user',
  sidebarCollapsed: 'admin-web:sidebar-collapsed',
}
