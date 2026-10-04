export const UserType = {
  Platform: 'platform',
  Merchant: 'merchant',
  /** 顾客小程序登录态：令牌只代表微信账号，门店由每次请求的 merchantCode 决定 */
  Client: 'client',
} as const;
export type UserType = (typeof UserType)[keyof typeof UserType];

export const MerchantStatus = {
  PendingAudit: 'pending_audit',
  Active: 'active',
  Disabled: 'disabled',
  Expired: 'expired',
} as const;
export type MerchantStatus = (typeof MerchantStatus)[keyof typeof MerchantStatus];

export const AccountStatus = {
  Active: 'active',
  Disabled: 'disabled',
} as const;
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

export const StoreStatus = {
  Open: 'open',
  Closed: 'closed',
} as const;
export type StoreStatus = (typeof StoreStatus)[keyof typeof StoreStatus];

export const CategoryStatus = {
  Enabled: 'enabled',
  Disabled: 'disabled',
} as const;
export type CategoryStatus = (typeof CategoryStatus)[keyof typeof CategoryStatus];

export const DishStatus = {
  OnSale: 'on_sale',
  OffSale: 'off_sale',
} as const;
export type DishStatus = (typeof DishStatus)[keyof typeof DishStatus];

export const StockType = {
  Unlimited: 'unlimited',
  Fixed: 'fixed',
} as const;
export type StockType = (typeof StockType)[keyof typeof StockType];

export const OptionGroupType = {
  Single: 'single',
  Multi: 'multi',
} as const;
export type OptionGroupType = (typeof OptionGroupType)[keyof typeof OptionGroupType];

export const OrderStatus = {
  Pending: 'pending',
  Accepted: 'accepted',
  Preparing: 'preparing',
  Ready: 'ready',
  Completed: 'completed',
  Cancelled: 'cancelled',
  Refunded: 'refunded',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/** 订单可推进的状态流转顺序，接单端按此顺序提供操作按钮 */
export const ORDER_STATUS_FLOW: readonly OrderStatus[] = [
  OrderStatus.Pending,
  OrderStatus.Accepted,
  OrderStatus.Preparing,
  OrderStatus.Ready,
  OrderStatus.Completed,
];

export const DineType = {
  DineIn: 'dine_in',
  Takeout: 'takeout',
  Pickup: 'pickup',
} as const;
export type DineType = (typeof DineType)[keyof typeof DineType];

/**
 * 桌位的用餐状态。与 `AccountStatus`（启用/停用）是两件事：
 * - `AccountStatus` 管「这张桌还能不能用」（装修、包场时停用，扫码头失效）；
 * - `TableDiningStatus` 管「这张桌此刻有没有人在吃」（收银台开台/清台）。
 * 混成一个字段会让「停用一张正在用餐的桌」变得无法表达。
 */
export const TableDiningStatus = {
  Idle: 'idle',
  Dining: 'dining',
} as const;
export type TableDiningStatus =
  (typeof TableDiningStatus)[keyof typeof TableDiningStatus];

export const MemberLevel = {
  Normal: 'normal',
  Silver: 'silver',
  Gold: 'gold',
  Vip: 'vip',
} as const;
export type MemberLevel = (typeof MemberLevel)[keyof typeof MemberLevel];

export const MemberStatus = AccountStatus;
export type MemberStatus = AccountStatus;

export const Gender = {
  Unknown: 'unknown',
  Male: 'male',
  Female: 'female',
} as const;
export type Gender = (typeof Gender)[keyof typeof Gender];

export const StaffRole = {
  Owner: 'owner',
  Manager: 'manager',
  Cashier: 'cashier',
  Kitchen: 'kitchen',
  Waiter: 'waiter',
} as const;
export type StaffRole = (typeof StaffRole)[keyof typeof StaffRole];

/**
 * 订单的支付状态。与 OrderStatus（出餐流转）刻意分开：
 * 出餐进度和钱是两条独立状态机，混在一起迟早对不上账。
 */
export const PayStatus = {
  Unpaid: 'unpaid',
  Paid: 'paid',
  PartiallyRefunded: 'partially_refunded',
  Refunded: 'refunded',
} as const;
export type PayStatus = (typeof PayStatus)[keyof typeof PayStatus];

/* ============================ 优惠券 ============================ */

export const CouponType = {
  /** 满减券：直减 amountCents */
  Reduction: 'reduction',
  /** 折扣券：按 discountRatio 计实付 */
  Discount: 'discount',
} as const;
export type CouponType = (typeof CouponType)[keyof typeof CouponType];

/** 模板状态，与会员券状态刻意不同名：模板 enable/disable 不影响已发出的券。 */
export const CouponStatus = {
  Enabled: 'enabled',
  Disabled: 'disabled',
} as const;
export type CouponStatus = (typeof CouponStatus)[keyof typeof CouponStatus];

export const MemberCouponStatus = {
  Unused: 'unused',
  Used: 'used',
  Expired: 'expired',
} as const;
export type MemberCouponStatus =
  (typeof MemberCouponStatus)[keyof typeof MemberCouponStatus];

export const CouponValidityType = {
  /** 固定起止时间 */
  Fixed: 'fixed',
  /** 领取后 N 天有效 */
  Relative: 'relative',
} as const;
export type CouponValidityType =
  (typeof CouponValidityType)[keyof typeof CouponValidityType];

export const CouponScopeType = {
  All: 'all',
  Category: 'category',
  Dish: 'dish',
} as const;
export type CouponScopeType = (typeof CouponScopeType)[keyof typeof CouponScopeType];

export const CouponSource = {
  /** 顾客在领券中心自助领取 */
  Claim: 'claim',
  /** 商户定向发放 */
  MerchantSend: 'merchant_send',
  /** 兑换码兑换 */
  RedeemCode: 'redeem_code',
} as const;
export type CouponSource = (typeof CouponSource)[keyof typeof CouponSource];

/** 运营位活动状态：停用只是从顾客端消失，商家端仍留着这条配置。 */
export const ActivityStatus = {
  Enabled: 'enabled',
  Disabled: 'disabled',
} as const;
export type ActivityStatus = (typeof ActivityStatus)[keyof typeof ActivityStatus];

/** 展示位：一张活动只挂一个位置，顾客端按位置取卡。 */
export const ActivitySlot = {
  /** 首页 Banner 轮播 */
  Home: 'home',
  /** 「我的」页那枚唯一色块卡 */
  Mine: 'mine',
  /** 会员中心活动区 */
  Member: 'member',
} as const;
export type ActivitySlot = (typeof ActivitySlot)[keyof typeof ActivitySlot];

/**
 * 点击跳转目标机器码。
 *
 * 只列小程序里真实存在的页面：商户配不出死链，前端也就不用写「跳过去发现没有这页」的兜底。
 */
export const ActivityAction = {
  None: 'none',
  Coupons: 'coupons',
  Menu: 'menu',
  Member: 'member',
  Stores: 'stores',
  Search: 'search',
  /** 进菜单并只看这个限时活动的菜，需要同时配 promotionId */
  Promotion: 'promotion',
} as const;
export type ActivityAction = (typeof ActivityAction)[keyof typeof ActivityAction];

/** 限时活动状态：停用只是不再改价，历史订单上的成交价不受影响。 */
export const PromotionStatus = {
  Enabled: 'enabled',
  Disabled: 'disabled',
} as const;
export type PromotionStatus = (typeof PromotionStatus)[keyof typeof PromotionStatus];

/**
 * 活动优惠算法。
 *
 * price 记「基础价上的活动价」，落到明细时换算成立减额，
 * 这样选了大份也能跟着减同一额度（与 dish.memberPrice 同一口径）；
 * discount 记实付比例，按该行真实价格算折扣。
 */
export const PromotionType = {
  Price: 'price',
  Discount: 'discount',
} as const;
export type PromotionType = (typeof PromotionType)[keyof typeof PromotionType];

/* ============================ 小票打印 ============================ */

/**
 * 打印方式。两种都是商家侧真实存在的收银形态：
 * - `browser`：收银台电脑接的热敏小票机，走浏览器打印，无需任何凭据，开箱可用；
 * - `cloud`：飞鹅/易联云等云打印机，由后端把任务推给厂商网关，断电断网也能补打。
 *
 * 刻意不做「本地代理直连 IP」这种写法：门店内网地址不可控，
 * 一旦收银机换网段整条链路就断，排查成本远高于收益。
 */
export const PrintMode = {
  Browser: 'browser',
  Cloud: 'cloud',
} as const;
export type PrintMode = (typeof PrintMode)[keyof typeof PrintMode];

/**
 * 小票类型。分开是因为顾客小票要打金额、后厨小票只打菜品和备注，
 * 两者的份数、触发时机、是否显示价格都不一样。
 */
export const PrintTicketType = {
  /** 顾客小票：含金额与门店抬头，用于对账和给顾客 */
  Customer: 'customer',
  /** 后厨小票：只出菜品、规格、备注，不含金额 */
  Kitchen: 'kitchen',
} as const;
export type PrintTicketType = (typeof PrintTicketType)[keyof typeof PrintTicketType];

/** 打印机接口格式，云打印机厂商的指令集，browser 模式下不生效。 */
export const PrintPaperSize = {
  /** 58mm 热敏纸 */
  Mm58: '58mm',
  /** 80mm 热敏纸，收银台主流 */
  Mm80: '80mm',
} as const;
export type PrintPaperSize = (typeof PrintPaperSize)[keyof typeof PrintPaperSize];

/**
 * 打印任务状态机。与支付单一种思路：任务一旦落库就只往前走，
 * 失败保留失败原因，供商家端「重试」按钮原样重发。
 */
export const PrintTaskStatus = {
  Pending: 'pending',
  Success: 'success',
  Failed: 'failed',
} as const;
export type PrintTaskStatus = (typeof PrintTaskStatus)[keyof typeof PrintTaskStatus];

export const PRINT_TASK_STATUS_LABELS: Record<PrintTaskStatus, string> = {
  [PrintTaskStatus.Pending]: '待打印',
  [PrintTaskStatus.Success]: '已打印',
  [PrintTaskStatus.Failed]: '打印失败',
};

export const PRINT_TICKET_TYPE_LABELS: Record<PrintTicketType, string> = {
  [PrintTicketType.Customer]: '顾客小票',
  [PrintTicketType.Kitchen]: '后厨小票',
};

export const PRINT_MODE_LABELS: Record<PrintMode, string> = {
  [PrintMode.Browser]: '浏览器小票机',
  [PrintMode.Cloud]: '云打印机',
};

/** 单次最多打印份数：打错一次多出十几张纸的代价比多点一次按钮高。 */
export const PRINT_MAX_COPIES = 5;

/** 打印失败后允许的重试次数上限，超过后只能到店排查打印机。 */
export const PRINT_MAX_RETRY = 3;

/* ============================ 会员等级与成长值 ============================ */

/**
 * 等级门槛按「成长值」升序排定，数组顺序即档位顺序：
 * 会员中心的进度条、升级提示都由这里推导，不在前端硬编码任何档位数字。
 */
export interface MemberLevelRule {
  level: MemberLevel;
  /** 会员卡上的等级名 */
  label: string;
  /** 升到该等级所需成长值 */
  threshold: number;
}

export const MEMBER_LEVEL_RULES: readonly MemberLevelRule[] = [
  { level: MemberLevel.Normal, label: '绿卡会员', threshold: 0 },
  { level: MemberLevel.Silver, label: '银卡会员', threshold: 2000 },
  { level: MemberLevel.Gold, label: '金卡会员', threshold: 5000 },
  { level: MemberLevel.Vip, label: '钻石会员', threshold: 12000 },
];

/** 消费 1 元累计的成长值，与积分（同样按元）分开：积分可花，成长值只涨不跌。 */
export const GROWTH_PER_YUAN = 1;

export function levelByGrowth(growthValue: number): MemberLevelRule {
  let current = MEMBER_LEVEL_RULES[0]!;
  for (const rule of MEMBER_LEVEL_RULES) {
    if (growthValue >= rule.threshold) {
      current = rule;
    }
  }
  return current;
}

export function nextLevelOf(level: MemberLevel): MemberLevelRule | null {
  const index = MEMBER_LEVEL_RULES.findIndex((rule) => rule.level === level);
  return index >= 0 && index + 1 < MEMBER_LEVEL_RULES.length
    ? MEMBER_LEVEL_RULES[index + 1]!
    : null;
}

/* ============================ 状态文案 ============================ */

/**
 * 面向用户的状态中文名集中在这里，三端（平台、商家、小程序）共用一份。
 * 放在后端而不是前端，是为了让订单列表、支付流水、小程序跟踪页说同一套话；
 * 前端只按机器码取样式，不再自己翻译状态。
 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.Pending]: '待接单',
  [OrderStatus.Accepted]: '已接单',
  [OrderStatus.Preparing]: '制作中',
  [OrderStatus.Ready]: '待取餐',
  [OrderStatus.Completed]: '已完成',
  [OrderStatus.Cancelled]: '已取消',
  [OrderStatus.Refunded]: '已退款',
};

export const DINE_TYPE_LABELS: Record<DineType, string> = {
  [DineType.DineIn]: '堂食',
  [DineType.Takeout]: '外送',
  [DineType.Pickup]: '自取',
};

export const TABLE_DINING_STATUS_LABELS: Record<TableDiningStatus, string> = {
  [TableDiningStatus.Idle]: '空闲',
  [TableDiningStatus.Dining]: '用餐中',
};

export const PAY_STATUS_LABELS: Record<PayStatus, string> = {
  [PayStatus.Unpaid]: '待支付',
  [PayStatus.Paid]: '已支付',
  [PayStatus.PartiallyRefunded]: '部分退款',
  [PayStatus.Refunded]: '已退款',
};

export const MEMBER_LEVEL_LABELS: Record<MemberLevel, string> = MEMBER_LEVEL_RULES.reduce(
  (labels, rule) => ({ ...labels, [rule.level]: rule.label }),
  {} as Record<MemberLevel, string>,
);
