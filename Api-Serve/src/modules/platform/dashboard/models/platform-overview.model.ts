export interface PlatformTrendPoint {
  date: string;
  orderCount: number;
  turnover: number;
}

export interface PlatformTopMerchant {
  merchantId: number;
  merchantName: string;
  orderCount: number;
  turnover: number;
}

export interface PlatformOverview {
  merchantTotal: number;
  merchantActive: number;
  merchantPendingAudit: number;
  /** 已过期 + 未来 30 天内到期的活跃商户数 */
  expiringCount: number;
  orderTotal: number;
  dishTotal: number;
  memberTotal: number;
  todayOrderCount: number;
  todayTurnover: number;
  yesterdayTurnover: number;
  orderTrend: PlatformTrendPoint[];
  topMerchants: PlatformTopMerchant[];
}
