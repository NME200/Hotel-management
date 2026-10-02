import { PaymentChannel } from '../constants/payment.constant';

/** 渠道级配置的生效值（已解密，仅进程内使用，绝不出现在接口响应里）。 */
export interface EffectiveChannelConfig {
  channel: PaymentChannel;
  enabled: boolean;
  notifyUrl: string;
  appId: string;
  mchId: string;
  serialNo: string;
  sandbox: boolean;
  apiKey: string;
  privateKey: string;
  publicKeyId: string;
  publicKey: string;
  /** 生效来源：后台保存的数据库配置，还是回落到 .env */
  source: 'database' | 'env' | 'none';
  missingFields: string[];
  /** 凭据齐备且渠道实现已接入，才可能真正收款 */
  ready: boolean;
}

export interface SecretFieldView {
  name: string;
  label: string;
  configured: boolean;
  masked: string;
  fingerprint: string | null;
}

export interface PaymentChannelItem {
  channel: PaymentChannel;
  label: string;
  enabled: boolean;
  ready: boolean;
  missingFields: string[];
  source: 'database' | 'env' | 'none';
  notifyUrl: string | null;
  appId: string | null;
  mchId: string | null;
  sandbox: boolean | null;
  secretFields: SecretFieldView[];
  updatedAt: Date | null;
}

export const MerchantPaymentStatus = {
  NotApplied: 'not_applied',
  PendingAudit: 'pending_audit',
  Enabled: 'enabled',
  Rejected: 'rejected',
  Disabled: 'disabled',
} as const;
export type MerchantPaymentStatus =
  (typeof MerchantPaymentStatus)[keyof typeof MerchantPaymentStatus];

export interface MerchantPaymentConfigItem {
  id: number | null;
  merchantId: number;
  merchantCode?: string;
  merchantName?: string;
  channel: PaymentChannel;
  channelLabel: string;
  status: MerchantPaymentStatus;
  channelAccount: string | null;
  feeRate: number | null;
  profitShareRate: number | null;
  settleAccountName: string | null;
  settleAccountNoMasked: string | null;
  licenseNo: string | null;
  contactName: string | null;
  contactPhone: string | null;
  appliedAt: Date | null;
  appliedByName: string | null;
  auditedAt: Date | null;
  auditedByName: string | null;
  auditRemark: string | null;
  updatedAt: Date | null;
  channelOpen: boolean;
}

export interface MerchantPaymentSummary {
  pendingAudit: number;
  enabled: number;
  rejected: number;
  disabled: number;
  notApplied: number;
}

/** 下单前解析出的可支付上下文：渠道参数 + 该商户的收款账号与费率。 */
export interface PayableContext {
  effective: EffectiveChannelConfig;
  channelAccount: string | null;
  feeRate: number | null;
  profitShareRate: number | null;
}

export const CHANNEL_LABELS: Record<PaymentChannel, string> = {
  [PaymentChannel.Wechat]: '微信支付',
  [PaymentChannel.Alipay]: '支付宝',
  [PaymentChannel.Mock]: '模拟支付',
};

/** 每个渠道必须齐备的字段，决定 ready 与 missingFields。 */
export const CHANNEL_REQUIRED_FIELDS: Record<PaymentChannel, string[]> = {
  [PaymentChannel.Wechat]: ['appId', 'mchId', 'apiKey', 'privateKey', 'notifyUrl'],
  [PaymentChannel.Alipay]: ['appId', 'privateKey', 'publicKey', 'notifyUrl'],
  [PaymentChannel.Mock]: [],
};

/** 各渠道需要单独管理的密钥字段（界面上逐个显示掩码与指纹）。 */
export const CHANNEL_SECRET_FIELDS: Record<
  PaymentChannel,
  ('apiKey' | 'privateKey' | 'publicKey')[]
> = {
  [PaymentChannel.Wechat]: ['apiKey', 'privateKey', 'publicKey'],
  [PaymentChannel.Alipay]: ['privateKey', 'publicKey'],
  [PaymentChannel.Mock]: [],
};

export const SECRET_FIELD_LABELS: Record<string, string> = {
  apiKey: 'APIv3 密钥',
  privateKey: '商户/应用私钥',
  publicKey: '平台/支付宝公钥',
};
