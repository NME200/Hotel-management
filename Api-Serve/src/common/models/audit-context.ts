import type { Request } from 'express';

/** 一条审计记录的操作人与来源信息。 */
export interface AuditActor {
  operatorId: number | null;
  operatorName: string;
  operatorType: string;
  ip: string | null;
  userAgent: string | null;
}

/**
 * 取真实来源 IP：反向代理下 req.ip 可能是代理地址，优先 x-forwarded-for 首段。
 */
export function readRequestMeta(
  request: Request,
): { ip: string | null; userAgent: string | null } {
  const forwarded = request.headers?.['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim();
  const userAgent = request.headers?.['user-agent'];

  return {
    ip: first || request.ip || request.socket?.remoteAddress || null,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 255) : null,
  };
}
