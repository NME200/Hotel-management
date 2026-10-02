import { http } from './request'
import type { AuditActionOption, AuditItem, AuditListParams } from './types/audit'
import type { PageResult } from './types/common'

/** GET /platform/audits */
export function fetchAudits(params: AuditListParams): Promise<PageResult<AuditItem>> {
  return http.get<PageResult<AuditItem>>('/platform/audits', { ...params })
}

/** GET /platform/audits/actions 操作类型下拉选项 */
export function fetchAuditActions(): Promise<AuditActionOption[]> {
  return http.get<AuditActionOption[]>('/platform/audits/actions')
}
