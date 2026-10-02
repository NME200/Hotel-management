import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { readRequestMeta, type AuditActor } from '../models/audit-context';
import type { AuthUser } from '../models/auth-context';

/**
 * 审计操作人参数装饰器：从登录态与请求头拼出 AuditActor，
 * 控制器只需声明一个参数即可把来源信息交给 AuditService。
 */
export const AuditContext = createParamDecorator(
  (_: undefined, context: ExecutionContext): AuditActor => {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = request.user;

    return {
      operatorId: user?.id ?? null,
      operatorName: user ? user.realName || user.username : '未知',
      operatorType: user?.userType ?? 'platform',
      ...readRequestMeta(request),
    };
  },
);
