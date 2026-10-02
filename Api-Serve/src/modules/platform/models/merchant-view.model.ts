import type { MerchantStatus, StoreStatus } from '../../../common/constants/dict';

/** 门店摘要，平台端只关心开业状态与基础联系方式 */
export interface StoreBrief {
  id: number;
  name: string;
  status: StoreStatus;
  logo: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  phone: string | null;
  notice: string | null;
  businessHours: string[];
}

/** 商户列表项：附带门店名与员工数，前端无需逐条二次请求 */
export interface MerchantListItem {
  id: number;
  code: string;
  name: string;
  contactName: string;
  contactPhone: string;
  logo: string | null;
  status: MerchantStatus;
  expireAt: Date | null;
  remark: string | null;
  createdAt: Date;
  storeName: string | null;
  staffCount: number;
}

/**
 * 商户级抽佣视图：只覆盖商户已提交进件的渠道。
 * 某渠道没有进件记录时字段为 null，表示「该渠道尚未定价」，
 * 与 profitShareRate=0（已定价为不抽佣）是两种不同含义，前端必须区分。
 */
export interface MerchantChannelCommission {
  channel: string;
  /** 渠道中文名，由后端下发，避免前端再维护一份映射 */
  channelLabel: string;
  /** 该渠道是否已有进件记录；false 时其余字段无意义 */
  configured: boolean;
  profitShareRate: number | null;
  /** 该渠道当前的开通状态，未进件时为 not_applied */
  status: string;
}

export interface MerchantDetail extends MerchantListItem {
  updatedAt: Date;
  auditedAt: Date | null;
  auditRemark: string | null;
  store: StoreBrief | null;
  /** 按渠道的抽佣比例，固定包含微信与支付宝两条（模拟渠道不参与抽佣） */
  commissions: MerchantChannelCommission[];
}

/** 到期预警行：daysLeft 为负表示已过期 */
export interface ExpiringMerchant {
  id: number;
  code: string;
  name: string;
  status: MerchantStatus;
  expireAt: Date;
  daysLeft: number;
}

/** 商户详情抽屉顶部的经营概要数字 */
export interface MerchantStatistics {
  dishCount: number;
  orderCount: number;
  memberCount: number;
  staffCount: number;
  /** 有效订单（排除已取消/已退款）累计实付金额 */
  totalTurnover: number;
  last7Orders: number;
}
