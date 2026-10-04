/**
 * 短信验证码配置（平台侧全局一行）。
 * 契约来源：Api-Serve/src/modules/sms/models/sms-config.model.ts
 */

/** 通道：log 只写日志（仅开发环境可选），aliyun / tencent 走云厂商，custom 走自建 HTTP 网关 */
export type SmsDriver = 'log' | 'aliyun' | 'tencent' | 'custom'

/** 生效配置来源：后台保存的 / 回落 .env 的 / 完全没有 */
export type SmsConfigSource = 'database' | 'env' | 'none'

/** 密钥字段的下发形态：只给「配没配 + 掩码 + 指纹」，明文永不出后端 */
export interface SmsSecretField {
  name: string
  label: string
  configured: boolean
  masked: string
  fingerprint: string | null
}

/** 一个通道的配置口径：界面按它决定显示哪些输入框、哪些必填、要几个密钥。 */
export interface SmsDriverMeta {
  driver: SmsDriver
  label: string
  /** 该通道界面上出现的字段名 */
  fields: string[]
  /** 该通道的必填字段名（决定表单校验规则） */
  requiredFields: string[]
  /** 字段中文名按厂商原文给（阿里云叫 AccessKey ID，腾讯云叫 SecretId），界面不自己写第二份 */
  labels: Record<string, string>
  /** 该通道的密钥字段（含掩码与指纹）：切换通道直接按这个渲染，不必先保存 */
  secretFields: SmsSecretField[]
  /** 留空时的兜底值，界面直接拿来当输入框占位符 */
  defaults: {
    region: string
    endpoint: string
    authHeader: string
    bodyTemplate: string
  }
}

/** GET /platform/sms-config */
export interface SmsConfigView {
  enabled: boolean
  /** 凭据是否配齐（不看总开关）：区分「没配」与「配了但关掉了」 */
  configured: boolean
  /** 后端下发的中文缺失项，界面直接用，不自己拼文案 */
  missingFields: string[]
  source: SmsConfigSource
  /** 生效通道（含 .env 回落） */
  driver: SmsDriver
  /** 后台显式选过的通道；null 表示跟随 .env */
  driverOverride: SmsDriver | null
  /** 当前部署环境是否允许选 log（生产环境不允许） */
  logAllowed: boolean
  /** 四个通道的口径，来自后端一份常量，切换通道时不需要先保存 */
  drivers: SmsDriverMeta[]
  accessKeyId: string | null
  sdkAppId: string | null
  signName: string | null
  templateCode: string | null
  region: string
  endpoint: string
  /** 数据库里显式填过的覆盖值；null 表示用的是 .env 或代码里的官方默认 */
  overrides: {
    region: string | null
    endpoint: string | null
    customAuthHeader: string | null
    customBodyTemplate: string | null
  }
  secretFields: SmsSecretField[]
  /** 后端声明 Date，JSON 序列化后是 ISO 字符串 */
  updatedAt: string | null
  updatedByName: string | null
}

/** PUT /platform/sms-config 请求体 */
export interface SmsConfigUpdateInput {
  enabled?: boolean
  /** null 表示不再覆盖，跟随 .env 的 SMS_DRIVER */
  driver?: SmsDriver | null
  accessKeyId?: string | null
  sdkAppId?: string | null
  signName?: string | null
  templateCode?: string | null
  region?: string | null
  endpoint?: string | null
  customAuthHeader?: string | null
  customBodyTemplate?: string | null
  /** 传 '********' 或不传表示不修改，空串表示清除 */
  secrets?: Partial<Record<'accessKeySecret' | 'customToken', string>>
}

/** POST /platform/sms-config/test 自检结果 */
export interface SmsTestResult {
  ok: boolean
  message: string
  checkedAt: string
}
