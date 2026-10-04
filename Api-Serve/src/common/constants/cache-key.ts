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
  /** 云打印机厂商凭据（平台侧全局一份），保存时主动失效 */
  printProvider: (provider: string) => `print:provider:${provider}`,
  /** 小程序 code2session 凭据（平台侧全局一份） */
  miniProgramConfig: () => 'mini:config',
  /** 小程序 access_token：微信限制获取频次，必须缓存复用，生成桌位码时要用 */
  miniProgramAccessToken: () => 'mini:access_token',
  /** 顾客侧菜单：按商户缓存，商家端改菜品时主动失效 */
  clientMenu: (merchantId: number) => `client:menu:${merchantId}`,
  /** 扫码/分享进入时 scene 解析出的商户，短 TTL 即可 */
  clientMerchantByCode: (code: string) => `client:mch:${code}`,
  /** 短信验证码：5 分钟有效，验证通过即删；错满次数也删 */
  smsCode: (phone: string) => `sms:code:${phone}`,
  /** 短信配置（平台侧全局一行），保存时主动失效 */
  smsConfig: () => 'sms:config',
  /** 同一手机号的重发间隔（60 秒一把锁） */
  smsResendGap: (phone: string) => `sms:gap:${phone}`,
  /** 同一手机号当日发送次数 */
  smsDailyPhone: (phone: string) => `sms:day:${phone}`,
  /** 同一来源 IP 当日发送次数：只按号码限流的话，换号刷一样能刷爆 */
  smsDailyIp: (ip: string) => `sms:ip:${ip}`,
} as const;

export const CacheTtl = {
  store: 600,
  dashboard: 60,
  platformDashboard: 60,
  miniProgramConfig: 60,
  clientMenu: 120,
  /** 与支付渠道配置同档：密钥改了要尽快生效，但不值得每次发码都查一次库 */
  printProvider: 60,
  smsConfig: 60,
} as const;
