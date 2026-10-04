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
  /** 上传图片：只落文件不改业务数据，能改菜品/分类/门店图的人才有它 */
  MediaUpload: 'media:upload',
  OrderRead: 'order:read',
  OrderUpdate: 'order:update',
  /**
   * 打印分两级：`print:read` 看打印流水，`print:create` 才真的出纸。
   * 刻意与 `order:update` 分开 —— 前台和后厨都能打小票，但不该都能改订单状态。
   */
  PrintRead: 'print:read',
  PrintCreate: 'print:create',
  /** 打印机配置的增删改：能改硬件的只有店长及以上 */
  PrinterManage: 'printer:manage',
  /**
   * 桌位分两级：`table:read` 看桌位与二维码，`table:manage` 才能增删改与重制码。
   * 与打印同一思路 —— 前台服务员需要看桌位，但重印二维码属于店长的事。
   */
  TableRead: 'table:read',
  TableManage: 'table:manage',
  /**
   * 开台 / 清台：改的是「这张桌此刻有没有人在吃」，不是桌位配置本身。
   * 与 `table:manage` 分开 —— 收银员与服务员天天要开台清台，
   * 但不该能改桌号、重制二维码。
   */
  TableOperate: 'table:operate',
  /**
   * 收银台：决定能不能登录 CM-web 收银端。这是收银台的唯一入口闸门，
   * 没有它的员工连登录都过不去（见 AuthService.loginByCashier）。
   */
  CashierUse: 'cashier:use',
  /** 线下点餐建单：收银员替到店顾客开单，与顾客自助下单是两条不同的入口 */
  OrderCreate: 'order:create',
  /** 收银台按手机号查会员（只读，只回昵称/等级/脱敏手机号） */
  MemberLookup: 'member:lookup',
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
  /**
   * 云打印机厂商密钥同样是平台与厂商之间的合同凭据，只有平台管理员能改；
   * 运营在商家端看得到机器状态，但不接触 apikey / client_secret。
   */
  PlatformPrintManage: 'platform:print:manage',
  PlatformPrintRead: 'platform:print:read',
  /** 短信凭据与签名同理：一套凭据服务全部商户，商户与运营都改不了 */
  PlatformSmsManage: 'platform:sms:manage',
  PlatformSmsRead: 'platform:sms:read',
  /** 会员管理从商家端搬上来：账号跨店，停用与档案只能由平台统一管 */
  PlatformMemberRead: 'platform:member:read',
  PlatformMemberManage: 'platform:member:manage',
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
  Permission.MediaUpload,
  Permission.OrderRead,
  Permission.OrderUpdate,
  Permission.PrintRead,
  Permission.PrintCreate,
  Permission.PrinterManage,
  Permission.TableRead,
  Permission.TableManage,
  Permission.TableOperate,
  Permission.CashierUse,
  Permission.OrderCreate,
  Permission.MemberLookup,
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
    Permission.PrintRead,
    Permission.PrintCreate,
    // 前台要看得到桌位与桌贴二维码，但改桌位/重制码是店长的事
    Permission.TableRead,
    // 收银员的核心三件事：开台清台、替顾客开单、按手机号认会员
    Permission.TableOperate,
    Permission.OrderCreate,
    Permission.MemberLookup,
    // 收银台的登录闸门：只有拿到它才能进 CM-web
    Permission.CashierUse,
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
    Permission.PrintRead,
    Permission.PrintCreate,
    Permission.TableRead,
  ],
  [StaffRole.Waiter]: [
    Permission.StoreRead,
    Permission.CategoryRead,
    Permission.DishRead,
    Permission.OrderRead,
    Permission.OrderUpdate,
    Permission.PrintRead,
    Permission.PrintCreate,
    Permission.TableRead,
    // 服务员要开台清台，但收银与收银台登录不归他
    Permission.TableOperate,
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
    Permission.PlatformPrintManage,
    Permission.PlatformPrintRead,
    Permission.PlatformSmsManage,
    Permission.PlatformSmsRead,
    Permission.PlatformMemberRead,
    Permission.PlatformMemberManage,
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
    // 只读：看得到云打印机与短信配没配好，改密钥仍然只有平台管理员
    Permission.PlatformPrintRead,
    Permission.PlatformSmsRead,
    Permission.PlatformMemberRead,
    Permission.PlatformMemberManage,
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
