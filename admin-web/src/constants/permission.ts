/**
 * 后端下发的权限项（接口返回的是具体项，这里集中管理避免字符串散写）。
 * platform_admin 拥有全部；platform_operator 只有
 * merchant:read / merchant:audit / platform:merchant:view / platform:dashboard:read / platform:audit:read
 * 以及支付相关的 platform:merchant-payment:read / platform:merchant-payment:audit / platform:payment:read。
 */
export const PERMISSION = {
  merchantRead: 'merchant:read',
  merchantCreate: 'merchant:create',
  merchantUpdate: 'merchant:update',
  merchantAudit: 'merchant:audit',
  merchantView: 'platform:merchant:view',
  dashboardRead: 'platform:dashboard:read',
  auditRead: 'platform:audit:read',
  accountManage: 'platform:account:manage',
  /** 渠道密钥与总开关，只有 platform_admin 有 */
  paymentManage: 'platform:payment:manage',
  merchantPaymentRead: 'platform:merchant-payment:read',
  merchantPaymentAudit: 'platform:merchant-payment:audit',
  /** 全平台支付流水只读，admin 与 operator 都有 */
  paymentRead: 'platform:payment:read',
  /** 顾客小程序 AppID / AppSecret，只有 platform_admin 有 */
  miniProgramManage: 'platform:mini-program:manage',
} as const

export type PermissionCode = (typeof PERMISSION)[keyof typeof PERMISSION]

/**
 * 判断权限集合是否满足要求。
 * 后端可能下发通配形式（如 `merchant:*` 或 `*`），这里一并兼容。
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
