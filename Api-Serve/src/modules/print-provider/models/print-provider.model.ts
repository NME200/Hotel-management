import type { PrintProvider } from '../constants/print-provider.constant';

/**
 * 云打印厂商配置的生效值（已解密，仅进程内使用，绝不出现在接口响应里）。
 *
 * 与 `EffectiveChannelConfig` 一个路子：业务层只认这个结构，
 * 不关心值来自数据库还是 `.env`。
 */
export interface EffectivePrintProviderConfig {
  provider: PrintProvider;
  enabled: boolean;
  /** 飞鹅账号 uid；易联云为空 */
  uid: string;
  /** 飞鹅 apikey */
  apiKey: string;
  /** 易联云应用 client_id */
  clientId: string;
  /** 易联云 client_secret */
  clientSecret: string;
  /** 生效的网关地址，已含官方兜底 */
  baseUrl: string;
  source: 'database' | 'env' | 'none';
  missingFields: string[];
  /** 凭据齐备（不看总开关）：界面用它区分「没配」与「配了但关掉了」 */
  configured: boolean;
}

/** 密钥字段的下发形态：只给「配没配 + 掩码 + 指纹」。 */
export interface PrintSecretFieldView {
  name: string;
  label: string;
  configured: boolean;
  masked: string;
  fingerprint: string | null;
}

export interface PrintProviderItem {
  provider: PrintProvider;
  label: string;
  enabled: boolean;
  configured: boolean;
  missingFields: string[];
  source: 'database' | 'env' | 'none';
  /** 账号类字段明文可见（uid / client_id），它们不是密钥 */
  account: string | null;
  baseUrl: string;
  /** 数据库里显式填过的网关地址；null 表示没覆盖，用的是官方默认 */
  baseUrlOverride: string | null;
  secretFields: PrintSecretFieldView[];
  updatedAt: Date | null;
  updatedByName: string | null;
}

export interface PrintProviderTestResult {
  ok: boolean;
  message: string;
  checkedAt: Date;
}
