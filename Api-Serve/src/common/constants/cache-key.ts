/**
 * Redis key 统一在这里定义，避免各处拼字符串。
 */
export const CacheKey = {
  refreshToken: (sessionId: string) => `auth:refresh:${sessionId}`,
  loginFailure: (scope: string) => `auth:fail:${scope}`,
  store: (merchantId: number) => `store:${merchantId}`,
  dashboard: (merchantId: number) => `dashboard:${merchantId}`,
  platformDashboard: () => 'platform:dashboard',
  paymentChannel: (channel: string) => `pay:channel:${channel}`,
  /** 小程序 code2session 凭据（平台侧全局一份） */
  miniProgramConfig: () => 'mini:config',
  /** 顾客侧菜单：按商户缓存，商家端改菜品时主动失效 */
  clientMenu: (merchantId: number) => `client:menu:${merchantId}`,
  /** 扫码/分享进入时 scene 解析出的商户，短 TTL 即可 */
  clientMerchantByCode: (code: string) => `client:mch:${code}`,
} as const;

export const CacheTtl = {
  store: 600,
  dashboard: 60,
  platformDashboard: 60,
  miniProgramConfig: 60,
  clientMenu: 120,
} as const;
