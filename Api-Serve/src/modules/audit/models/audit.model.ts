import type { AuditActor } from '../../../common/models/audit-context';
import type { AuditAction, AuditTargetType } from '../constants/audit-action';

export interface AuditEntry {
  action: AuditAction | string;
  targetType?: AuditTargetType | string;
  targetId?: number | null;
  targetName?: string | null;
  detail?: Record<string, unknown> | null;
}

export interface AuditItem {
  id: number;
  operatorId: number | null;
  operatorName: string;
  operatorType: string;
  action: string;
  actionLabel: string;
  targetType: string | null;
  targetId: number | null;
  targetName: string | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}
