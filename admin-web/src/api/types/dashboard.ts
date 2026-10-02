/** GET /platform/dashboard/overview 的 7 天趋势点，date 形如 2026-09-25 */
export interface PlatformTrendPoint {
  date: string
  orderCount: number
  turnover: number
}

export interface PlatformTopMerchant {
  merchantId: number
  merchantName: string
  orderCount: number
  turnover: number
}

export interface PlatformOverview {
  merchantTotal: number
  merchantActive: number
  merchantPendingAudit: number
  expiringCount: number
  todayOrderCount: number
  todayTurnover: number
  yesterdayTurnover: number
  orderTotal: number
  dishTotal: number
  memberTotal: number
  /** 固定 7 项，最后一项为今日 */
  orderTrend: PlatformTrendPoint[]
  /** 最多 5 个 */
  topMerchants: PlatformTopMerchant[]
}
