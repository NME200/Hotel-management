export interface TrendPoint {
  date: string;
  orderCount: number;
  turnover: number;
}

export interface HotDish {
  id: number;
  name: string;
  salesCount: number;
}

export interface DashboardOverview {
  todayOrderCount: number;
  todayTurnover: number;
  pendingOrderCount: number;
  dishCount: number;
  memberCount: number;
  orderTrend: TrendPoint[];
  hotDishes: HotDish[];
}
