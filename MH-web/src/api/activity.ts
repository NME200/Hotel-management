import { http } from './request'
import type { Activity, ActivityInput, ActivityListParams, ActivityStatus } from './types/activity'
import type { PageResult } from './types/common'

/** GET /merchant/activities */
export function fetchActivities(params: ActivityListParams): Promise<PageResult<Activity>> {
  return http.get<PageResult<Activity>>('/merchant/activities', { ...params })
}

/** POST /merchant/activities */
export function createActivity(input: ActivityInput): Promise<Activity> {
  return http.post<Activity>('/merchant/activities', input)
}

/** PATCH /merchant/activities/{id} */
export function updateActivity(id: number, input: ActivityInput): Promise<Activity> {
  return http.patch<Activity>(`/merchant/activities/${id}`, input)
}

/** PATCH /merchant/activities/{id}/status */
export function updateActivityStatus(id: number, status: ActivityStatus): Promise<Activity> {
  return http.patch<Activity>(`/merchant/activities/${id}/status`, { status })
}

/** DELETE /merchant/activities/{id} */
export function deleteActivity(id: number): Promise<null> {
  return http.delete<null>(`/merchant/activities/${id}`)
}
