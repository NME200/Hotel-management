/**
 * 后端下发的权限项（收银台只关心这几项）。
 *
 * 这里刻意只列 CM-web 用得到的权限，不做全量镜像：
 * 全量镜像会让「这个前端到底需要哪些权限」变得看不出来。
 */
export const PERMISSION = {
  /** 收银台登录与使用（登录闸门就是它） */
  cashierUse: 'cashier:use',
  /** 线下点餐建单 */
  orderCreate: 'order:create',
  /** 按手机号认会员 */
  memberLookup: 'member:lookup',
  orderRead: 'order:read',
  orderUpdate: 'order:update',
  tableRead: 'table:read',
  /** 开台 / 清台 */
  tableOperate: 'table:operate',
  printRead: 'print:read',
  printCreate: 'print:create',
  paymentRead: 'payment:read',
  paymentCreate: 'payment:create',
  paymentRefund: 'payment:refund',
  categoryRead: 'category:read',
  dishRead: 'dish:read',
  storeRead: 'store:read',
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
