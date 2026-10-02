export interface DashboardTrendPoint {
  /** 形如 2026-09-25 */
  date: string
  orderCount: number
  turnover: number
}

export interface HotDish {
  id: number
  name: string
  salesCount: number
}

export interface DashboardOverview {
  todayOrderCount: number
  todayTurnover: number
  pendingOrderCount: number
  dishCount: number
  memberCount: number
  /** 近 7 天 */
  orderTrend: DashboardTrendPoint[]
  hotDishes: HotDish[]
}
