import { http } from './request'
import type { Staff, StaffCreateInput, StaffListParams, StaffUpdateInput } from './types/staff'
import type { PageResult } from './types/common'

/** GET /merchant/staffs */
export function fetchStaffs(params: StaffListParams): Promise<PageResult<Staff>> {
  return http.get<PageResult<Staff>>('/merchant/staffs', { ...params })
}

/** POST /merchant/staffs */
export function createStaff(input: StaffCreateInput): Promise<Staff> {
  return http.post<Staff>('/merchant/staffs', input)
}

/** PATCH /merchant/staffs/{id} */
export function updateStaff(id: number, input: StaffUpdateInput): Promise<Staff> {
  return http.patch<Staff>(`/merchant/staffs/${id}`, input)
}

/** DELETE /merchant/staffs/{id} */
export function deleteStaff(id: number): Promise<null> {
  return http.delete<null>(`/merchant/staffs/${id}`)
}

/** PATCH /merchant/staffs/{id}/password，重置密码（也可用于自己改密码） */
export function resetStaffPassword(id: number, password: string): Promise<null> {
  return http.patch<null>(`/merchant/staffs/${id}/password`, { password })
}
