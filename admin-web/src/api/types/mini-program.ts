/**
 * 顾客微信小程序凭据（平台侧全局单条配置）。
 * 契约来源：Api-Serve/src/modules/client/config/dto/mini-program-config.dto.ts
 */

/** 当前生效凭据的来源：后台保存的 / 回落 .env 的 / 完全没有，与支付渠道同一口径 */
export type MiniProgramConfigSource = 'database' | 'env' | 'none'

/**
 * GET /platform/mini-program-config
 * AppSecret 明文永不下发，只给「是否已配置 + 掩码 + 指纹」；
 * 后端把密钥只写不读，前端界面上任何时刻都拿不到真实值。
 */
export interface MiniProgramConfigView {
  /** 当前生效的 AppID：数据库有值取数据库，否则回落 .env 的 MINI_APP_ID */
  appId: string | null
  /** 是否开放顾客小程序登录 */
  loginEnabled: boolean
  secretConfigured: boolean
  /** 已配置时固定为掩码常量，未配置时为空串 */
  secretMasked: string
  /** AppSecret sha256 前 8 位，未配置为 null；保存前后比对它即可确认密钥到底改没改 */
  secretFingerprint: string | null
  source: MiniProgramConfigSource
  /** AppID 与 AppSecret 是否都已配齐，false 时顾客登录会被后端拦下 */
  configured: boolean
  /** 未配齐的字段，后端直接下发可读名（AppID / AppSecret） */
  missingFields: string[]
  /** .env 里是否留了兜底凭据：区分「没配也能登录」与「全靠数据库」 */
  envFallbackAvailable: boolean
  /** 后端声明 Date，JSON 序列化后是 ISO 字符串 */
  updatedAt: string | null
  updatedByName: string | null
}

/**
 * PUT /platform/mini-program-config
 * appSecret 的三态语义（务必分清，否则会覆盖掉线上密钥）：
 * - 不带这个 key = 沿用原值；
 * - 传真实新值 = 覆盖；
 * - 传空串 = 清空已保存的密钥。
 * 后端把掩码也当作「不修改」，但前端在未改动时直接不下发该字段。
 */
export interface MiniProgramConfigUpdateInput {
  appId: string
  appSecret?: string
  loginEnabled?: boolean
}

/**
 * POST /platform/mini-program-config/test
 * 自检只针对「已保存」的配置：先查本地凭据完整性，再用凭据探测微信接口。
 */
export interface MiniProgramConnectivityResult {
  ok: boolean
  message: string
  /** 后端声明 Date，JSON 序列化后是 ISO 字符串 */
  checkedAt: string
}
