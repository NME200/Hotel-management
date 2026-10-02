import { http } from './request'
import type { DashboardOverview } from './types/dashboard'

/** GET /merchant/dashboard/overview */
export function fetchDashboardOverview(): Promise<DashboardOverview> {
  return http.get<DashboardOverview>('/merchant/dashboard/overview')
}
