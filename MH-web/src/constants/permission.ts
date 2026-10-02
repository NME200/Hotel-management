/** 后端下发的权限项（接口返回的是具体项，这里集中管理避免字符串散写） */
export const PERMISSION = {
  storeRead: 'store:read',
  storeUpdate: 'store:update',
  categoryRead: 'category:read',
  categoryCreate: 'category:create',
  categoryUpdate: 'category:update',
  categoryDelete: 'category:delete',
  dishRead: 'dish:read',
  dishCreate: 'dish:create',
  dishUpdate: 'dish:update',
  dishDelete: 'dish:delete',
  dishToggle: 'dish:toggle',
  activityRead: 'activity:read',
  activityCreate: 'activity:create',
  activityUpdate: 'activity:update',
  activityDelete: 'activity:delete',
  promotionRead: 'promotion:read',
  promotionCreate: 'promotion:create',
  promotionUpdate: 'promotion:update',
  promotionDelete: 'promotion:delete',
  orderRead: 'order:read',
  orderUpdate: 'order:update',
  memberRead: 'member:read',
  memberUpdate: 'member:update',
  staffRead: 'staff:read',
  staffCreate: 'staff:create',
  staffUpdate: 'staff:update',
  staffDelete: 'staff:delete',
  dashboardRead: 'dashboard:read',
  paymentRead: 'payment:read',
  paymentApply: 'payment:apply',
} as const

export type PermissionCode = (typeof PERMISSION)[keyof typeof PERMISSION]

/**
 * 判断权限集合是否满足要求。
 * 后端可能下发通配形式（如 `dish:*` 或 `*`），这里一并兼容。
 */
export function matchPermission(permissions: readonly string[], required: string): boolean {
  if (required === 'all') return true
  return permissions.some((owned) => {
    if (owned === required || owned === '*') return true
    if (owned === '*:*') return true
    if (owned.endsWith(':*')) {
      const scope = owned.slice(0, -1)
      return required.startsWith(scope)
    }
    if (owned.startsWith('*:')) {
      return required.endsWith(owned.slice(1))
    }
    return false
  })
}

export function hasAllPermissions(permissions: readonly string[], required?: readonly string[]): boolean {
  if (!required || required.length === 0) return true
  return required.every((item) => matchPermission(permissions, item))
}
