import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, ROLES_KEY } from '../decorators/auth.decorators';
import { BusinessException } from '../exceptions/business.exception';
import type { AuthUser } from '../models/auth-context';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const permissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!roles?.length && !permissions?.length) {
      return true;
    }

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) {
      throw BusinessException.forbidden('未登录或登录已失效');
    }

    const roleMatched = (roles ?? []).includes(user.role);
    const permissionMatched = (permissions ?? []).some((permission) =>
      user.permissions.includes(permission),
    );

    if (!roleMatched && !permissionMatched) {
      throw BusinessException.forbidden('无操作权限');
    }
    return true;
  }
}
