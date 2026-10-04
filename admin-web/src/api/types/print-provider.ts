/**
 * 云打印机厂商配置（平台侧，每厂商一条）。
 * 契约来源：Api-Serve/src/modules/print-provider/models/print-provider.model.ts
 */

/** 云打印机厂商机器码，与后端 print-provider.constant.ts 同源 */
export type PrintProvider = 'feie' | 'yilianyun'

/** 当前生效配置的来源：后台保存的 / 回落 .env 的 / 完全没有 */
export type PrintProviderSource = 'database' | 'env' | 'none'

/**
 * 密钥字段的下发形态：只给「配没配 + 掩码 + 指纹」，明文永不出后端。
 * 与支付渠道的 SecretField 同构。
 */
export interface PrintSecretField {
  /** 后端字段名，提交时作为 secrets 的 key */
  name: string
  /** 后端下发的可读名，直接用，不自己拼文案 */
  label: string
  configured: boolean
  /** 已配置时固定为掩码常量 */
  masked: string
  /** sha256 前 8 位，用于确认「密钥到底改没改」 */
  fingerprint: string | null
}

/**
 * GET /platform/print-providers
 * 一个厂商一张卡片：账号类字段（uid / client_id）明文可见，密钥只回掩码。
 */
export interface PrintProviderItem {
  provider: PrintProvider
  label: string
  /** 平台侧厂商总开关 */
  enabled: boolean
  /** 凭据是否配齐（不看总开关）：区分「没配」与「配了但关掉了」 */
  configured: boolean
  /** 未配齐的字段名，后端下发英文 key，界面用 printProviderFieldLabel 转中文 */
  missingFields: string[]
  source: PrintProviderSource
  /** 飞鹅为后台登录账号（官方参数名 user），易联云为 client_id；未配置时为 null */
  account: string | null
  /** 生效的网关地址（已含官方兜底） */
  baseUrl: string
  /** 数据库里显式填过的覆盖地址；null 表示用的官方默认地址 */
  baseUrlOverride: string | null
  secretFields: PrintSecretField[]
  /** 后端声明 Date，JSON 序列化后是 ISO 字符串 */
  updatedAt: string | null
  updatedByName: string | null
}

/**
 * PUT /platform/print-providers/{provider}
 * 密钥三态语义（必须分清，否则会把线上密钥覆盖成掩码）：
 * - 不带这个 key = 沿用原值；
 * - 传真实新值 = 覆盖；
 * - 传空串 = 清空。
 */
export interface PrintProviderUpdateInput {
  enabled?: boolean
  uid?: string | null
  clientId?: string | null
  baseUrl?: string | null
  secrets?: Partial<Record<'apiKey' | 'clientSecret', string>>
}

/**
 * POST /platform/print-providers/{provider}/test
 * 自检只针对「已保存」的配置：先查凭据完整性，再向厂商网关换一次访问权。
 */
export interface PrintProviderTestResult {
  ok: boolean
  message: string
  checkedAt: string
}
