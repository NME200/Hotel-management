import { StaffRole, UserType } from './dict';

export const Permission = {
  StoreRead: 'store:read',
  StoreUpdate: 'store:update',
  CategoryRead: 'category:read',
  CategoryCreate: 'category:create',
  CategoryUpdate: 'category:update',
  CategoryDelete: 'category:delete',
  DishRead: 'dish:read',
  DishCreate: 'dish:create',
  DishUpdate: 'dish:update',
  DishDelete: 'dish:delete',
  DishToggle: 'dish:toggle',
  ActivityRead: 'activity:read',
  ActivityCreate: 'activity:create',
  ActivityUpdate: 'activity:update',
  ActivityDelete: 'activity:delete',
  PromotionRead: 'promotion:read',
  PromotionCreate: 'promotion:create',
  PromotionUpdate: 'promotion:update',
  PromotionDelete: 'promotion:delete',
  OrderRead: 'order:read',
  OrderUpdate: 'order:update',
  MemberRead: 'member:read',
  MemberUpdate: 'member:update',
  PaymentRead: 'payment:read',
  PaymentCreate: 'payment:create',
  PaymentRefund: 'payment:refund',
  PaymentApply: 'payment:apply',
  StaffRead: 'staff:read',
  StaffCreate: 'staff:create',
  StaffUpdate: 'staff:update',
  StaffDelete: 'staff:delete',
  DashboardRead: 'dashboard:read',
  MerchantRead: 'merchant:read',
  MerchantCreate: 'merchant:create',
  MerchantUpdate: 'merchant:update',
  MerchantAudit: 'merchant:audit',
  MerchantView: 'platform:merchant:view',
  PlatformDashboardRead: 'platform:dashboard:read',
  PlatformAuditRead: 'platform:audit:read',
  PlatformAccountManage: 'platform:account:manage',
  PlatformPaymentManage: 'platform:payment:manage',
  PlatformPaymentRead: 'platform:payment:read',
  PlatformMerchantPaymentRead: 'platform:merchant-payment:read',
  PlatformMerchantPaymentAudit: 'platform:merchant-payment:audit',
  /** 小程序 AppID/AppSecret 只能由平台管理员保管，运营不可见 */
  PlatformMiniProgramManage: 'platform:mini-program:manage',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const MERCHANT_ALL: readonly Permission[] = [
  Permission.StoreRead,
  Permission.StoreUpdate,
  Permission.CategoryRead,
  Permission.CategoryCreate,
  Permission.CategoryUpdate,
  Permission.CategoryDelete,
  Permission.DishRead,
  Permission.DishCreate,
  Permission.DishUpdate,
  Permission.DishDelete,
  Permission.DishToggle,
  Permission.ActivityRead,
  Permission.ActivityCreate,
  Permission.ActivityUpdate,
  Permission.ActivityDelete,
  Permission.PromotionRead,
  Permission.PromotionCreate,
  Permission.PromotionUpdate,
  Permission.PromotionDelete,
  Permission.OrderRead,
  Permission.OrderUpdate,
  Permission.MemberRead,
  Permission.MemberUpdate,
  Permission.PaymentRead,
  Permission.PaymentCreate,
  Permission.PaymentRefund,
  Permission.PaymentApply,
  Permission.StaffRead,
  Permission.StaffCreate,
  Permission.StaffUpdate,
  Permission.StaffDelete,
  Permission.DashboardRead,
];

/**
 * 商家端角色 -> 权限点。员工与菜品是运营核心，
 * 只有 owner / manager 可写，前台与后厨按最小权限授予。
 */
export const STAFF_ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  [StaffRole.Owner]: MERCHANT_ALL,
  [StaffRole.Manager]: MERCHANT_ALL.filter(
    (permission) => permission !== Permission.StaffDelete,
  ),
  [StaffRole.Cashier]: [
    Permission.StoreRead,
    Permission.CategoryRead,
    Permission.DishRead,
    Permission.OrderRead,
    Permission.OrderUpdate,
    Permission.MemberRead,
    Permission.MemberUpdate,
    Permission.PaymentRead,
    Permission.PaymentCreate,
    Permission.PaymentRefund,
    Permission.DashboardRead,
  ],
  [StaffRole.Kitchen]: [
    Permission.CategoryRead,
    Permission.DishRead,
    Permission.OrderRead,
    Permission.OrderUpdate,
  ],
  [StaffRole.Waiter]: [
    Permission.StoreRead,
    Permission.CategoryRead,
    Permission.DishRead,
    Permission.OrderRead,
    Permission.OrderUpdate,
    Permission.MemberRead,
  ],
};

export const PLATFORM_ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  platform_admin: [
    Permission.MerchantRead,
    Permission.MerchantCreate,
    Permission.MerchantUpdate,
    Permission.MerchantAudit,
    Permission.MerchantView,
    Permission.PlatformDashboardRead,
    Permission.PlatformAuditRead,
    Permission.PlatformAccountManage,
    Permission.PlatformPaymentManage,
    Permission.PlatformPaymentRead,
    Permission.PlatformMerchantPaymentRead,
    Permission.PlatformMerchantPaymentAudit,
    Permission.PlatformMiniProgramManage,
  ],
  // 运营可以审核商户进件与启停渠道，但不能碰渠道密钥
  platform_operator: [
    Permission.MerchantRead,
    Permission.MerchantAudit,
    Permission.MerchantView,
    Permission.PlatformDashboardRead,
    Permission.PlatformAuditRead,
    Permission.PlatformPaymentRead,
    Permission.PlatformMerchantPaymentRead,
    Permission.PlatformMerchantPaymentAudit,
  ],
};

export function resolvePermissions(
  userType: UserType,
  role: string,
): readonly Permission[] {
  if (userType === UserType.Platform) {
    return PLATFORM_ROLE_PERMISSIONS[role] ?? [];
  }
  return STAFF_ROLE_PERMISSIONS[role as StaffRole] ?? [];
}
