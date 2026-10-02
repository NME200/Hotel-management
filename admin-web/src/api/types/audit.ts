import type { PageQuery } from './common'

/** GET /platform/audits 列表项 */
export interface AuditItem {
  id: number
  operatorId: number | null
  operatorName: string
  /** 机器码，如 merchant.create */
  action: string
  /** 中文名，如「开通商户」，表格展示用 */
  actionLabel: string
  targetType: string | null
  targetId: number | null
  targetName: string | null
  detail: Record<string, unknown> | null
  ip: string | null
  userAgent: string | null
  createdAt: string
}

export interface AuditListParams extends PageQuery {
  action?: string
  from?: string
  to?: string
}

/** GET /platform/audits/actions 的筛选项 */
export interface AuditActionOption {
  value: string
  label: string
}
