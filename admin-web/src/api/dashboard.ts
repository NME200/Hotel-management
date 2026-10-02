import { http } from './request'
import type { PlatformOverview } from './types/dashboard'

/** GET /platform/dashboard/overview 全平台看板 */
export function fetchPlatformOverview(): Promise<PlatformOverview> {
  return http.get<PlatformOverview>('/platform/dashboard/overview')
}
