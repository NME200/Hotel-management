import { PLATFORM_ROLE_PERMISSIONS } from '../../../common/constants/permission';
import type { AccountStatus } from '../../../common/constants/dict';

/** 平台角色清单直接取自权限映射表，避免与 permission.ts 的定义脱节 */
export const PLATFORM_ROLES: readonly string[] = Object.keys(PLATFORM_ROLE_PERMISSIONS);

/** 超级管理员角色，唯一能管理平台账号的角色 */
export const PLATFORM_ADMIN_ROLE = 'platform_admin';

/** 平台账号视图：任何接口都不返回 passwordHash */
export interface PlatformAccountItem {
  id: number;
  username: string;
  realName: string;
  phone: string | null;
  role: string;
  status: AccountStatus;
  createdAt: Date;
  updatedAt: Date;
}
