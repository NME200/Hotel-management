import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../constants/permission';

export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';

/** 限定可访问的角色（如商户员工角色、平台角色）。 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/** 限定可访问的权限点，角色与权限任一命中即放行。 */
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
