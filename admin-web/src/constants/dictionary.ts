import type { PlatformRole } from '@/api/types/auth'
import type { AccountStatus } from '@/api/types/account'
import type { MerchantStatus, StoreStatus } from '@/api/types/merchant'
import type {
  MerchantPaymentFilterStatus,
  MerchantPaymentStatus,
  PaymentChannel,
  PaymentConfigSource,
  PaymentStatus,
  ProfitShareStatus,
  ReconcileDiffType,
  ReconcileStatus,
  RefundStatus,
} from '@/api/types/payment'
import type { MiniProgramConfigSource } from '@/api/types/mini-program'
import type {
  DineType,
  DishStatus,
  DishStockType,
  MemberGender,
  MemberLevel,
  MemberStatus,
  OrderStatus,
  StaffRole,
  StaffStatus,
} from '@/api/types/merchant-insight'

/** Element Plus el-tag 的 type 取值 */
export type TagType = 'primary' | 'success' | 'info' | 'warning' | 'danger'

export interface DictOption<T extends string = string> {
  value: T
  label: string
  tag: TagType
}

function buildDictMap<T extends string>(options: readonly DictOption<T>[]): Record<T, DictOption<T>> {
  return options.reduce<Record<T, DictOption<T>>>((map, option) => {
    map[option.value] = option
    return map
  }, {} as Record<T, DictOption<T>>)
}

export function dictLabel<T extends string>(map: Record<T, DictOption<T>>, value: T | null | undefined): string {
  if (value === null || value === undefined) return '--'
  return map[value]?.label ?? String(value)
}

export function dictTagType<T extends string>(map: Record<T, DictOption<T>>, value: T | null | undefined): TagType {
  if (value === null || value === undefined) return 'info'
  return map[value]?.tag ?? 'info'
}

/* ------------------------------ 平台账号 ------------------------------ */

export const PLATFORM_ROLE_OPTIONS: readonly DictOption<PlatformRole>[] = [
  { value: 'platform_admin', label: '超级管理员', tag: 'danger' },
  { value: 'platform_operator', label: '运营专员', tag: 'primary' },
]

export const PLATFORM_ROLE_DICT = buildDictMap(PLATFORM_ROLE_OPTIONS)

export const ACCOUNT_STATUS_OPTIONS: readonly DictOption<AccountStatus>[] = [
  { value: 'active', label: '启用', tag: 'success' },
  { value: 'disabled', label: '已禁用', tag: 'info' },
]

export const ACCOUNT_STATUS_DICT = buildDictMap(ACCOUNT_STATUS_OPTIONS)

/* ------------------------------ 商户 ------------------------------ */

export const MERCHANT_STATUS_OPTIONS: readonly DictOption<MerchantStatus>[] = [
  { value: 'pending_audit', label: '待审核', tag: 'warning' },
  { value: 'active', label: '正常', tag: 'success' },
  { value: 'disabled', label: '已停用', tag: 'info' },
  { value: 'expired', label: '已过期', tag: 'danger' },
]

export const MERCHANT_STATUS_DICT = buildDictMap(MERCHANT_STATUS_OPTIONS)

/** 待审核的商户才提供「审核通过」，其余状态用「恢复 / 停用」 */
export function canAuditMerchant(status: MerchantStatus): boolean {
  return status === 'pending_audit'
}

/** 已经正常运营的商户才需要「停用」 */
export function canDisableMerchant(status: MerchantStatus): boolean {
  return status === 'active'
}

/** 被停用的商户可以重新启用 */
export function canEnableMerchant(status: MerchantStatus): boolean {
  return status === 'disabled' || status === 'expired'
}

/* ------------------------------ 支付渠道 ------------------------------ */

export const PAYMENT_CHANNEL_OPTIONS: readonly DictOption<PaymentChannel>[] = [
  { value: 'wechat', label: '微信支付', tag: 'success' },
  { value: 'alipay', label: '支付宝', tag: 'primary' },
  { value: 'mock', label: '模拟支付', tag: 'info' },
]

export const PAYMENT_CHANNEL_DICT = buildDictMap(PAYMENT_CHANNEL_OPTIONS)

/** 配置来源：后台保存的 / 回落 .env 的 / 完全没有 */
export const PAYMENT_CONFIG_SOURCE_OPTIONS: readonly DictOption<PaymentConfigSource>[] = [
  { value: 'database', label: '后台配置', tag: 'success' },
  { value: 'env', label: '环境变量兜底', tag: 'warning' },
  { value: 'none', label: '未配置', tag: 'info' },
]

export const PAYMENT_CONFIG_SOURCE_DICT = buildDictMap(PAYMENT_CONFIG_SOURCE_OPTIONS)

/**
 * 渠道缺失字段的中文名兜底：后端 missingFields 下发英文 key，
 * 优先用 secretFields 里的 label，其次查这张表，查不到就原样展示，不编造文案。
 */
export const PAYMENT_FIELD_LABEL: Readonly<Record<string, string>> = {
  notifyUrl: '支付通知地址',
  appId: 'AppID',
  mchId: '服务商商户号',
  sandbox: '沙箱环境',
  apiV3Key: 'APIv3 密钥',
  mchPrivateKey: '商户私钥',
  wechatPublicKey: '微信支付公钥',
  privateKey: '应用私钥',
  alipayPublicKey: '支付宝公钥',
}

/** 渠道缺失字段的可读名称：先取后端下发的密钥 label，再查兜底表，查不到就原样展示 */
export function paymentFieldLabel(field: string, secretFields: readonly { name: string; label: string }[]): string {
  const secret = secretFields.find((item) => item.name === field)
  return secret?.label ?? PAYMENT_FIELD_LABEL[field] ?? field
}

/* ------------------------------ 商户支付开通 ------------------------------ */

export const MERCHANT_PAYMENT_STATUS_OPTIONS: readonly DictOption<MerchantPaymentStatus>[] = [
  { value: 'not_applied', label: '未申请', tag: 'info' },
  { value: 'pending_audit', label: '待审核', tag: 'warning' },
  { value: 'enabled', label: '已开通', tag: 'success' },
  { value: 'rejected', label: '已驳回', tag: 'danger' },
  { value: 'disabled', label: '已停用', tag: 'info' },
]

export const MERCHANT_PAYMENT_STATUS_DICT = buildDictMap(MERCHANT_PAYMENT_STATUS_OPTIONS)

/** 列表筛选可选项：not_applied 只是合成态，进件表里没有记录，后端会把该筛选值判为非法参数 */
export const MERCHANT_PAYMENT_FILTER_OPTIONS: readonly DictOption<MerchantPaymentFilterStatus>[] =
  MERCHANT_PAYMENT_STATUS_OPTIONS.filter(
    (item): item is DictOption<MerchantPaymentFilterStatus> => item.value !== 'not_applied',
  )

/** 待审核的申请才给「通过 / 驳回」 */
export function canAuditMerchantPayment(status: MerchantPaymentStatus): boolean {
  return status === 'pending_audit'
}

/** 已开通的渠道才需要「停用」 */
export function canDisableMerchantPayment(status: MerchantPaymentStatus): boolean {
  return status === 'enabled'
}

/** 驳回与停用的渠道都由平台直接重新启用 */
export function canEnableMerchantPayment(status: MerchantPaymentStatus): boolean {
  return status === 'disabled' || status === 'rejected'
}

/* ------------------------------ 平台支付流水 ------------------------------ */

/**
 * 支付单状态。created/paying 都算「未完成」，
 * 门禁与异常笔数在统计卡里单独体现，这里只负责展示。
 */
export const PAYMENT_STATUS_OPTIONS: readonly DictOption<PaymentStatus>[] = [
  { value: 'created', label: '已创建', tag: 'info' },
  { value: 'paying', label: '支付中', tag: 'warning' },
  { value: 'succeeded', label: '已成功', tag: 'success' },
  { value: 'failed', label: '失败', tag: 'danger' },
  { value: 'closed', label: '已关单', tag: 'info' },
]

export const PAYMENT_STATUS_DICT = buildDictMap(PAYMENT_STATUS_OPTIONS)

/** 仍可继续支付的未完成状态，与后端 OPEN_PAYMENT_STATUSES 口径一致 */
export const OPEN_PAYMENT_STATUSES: readonly PaymentStatus[] = ['created', 'paying']

export const REFUND_STATUS_OPTIONS: readonly DictOption<RefundStatus>[] = [
  { value: 'processing', label: '处理中', tag: 'warning' },
  { value: 'succeeded', label: '已退款', tag: 'success' },
  { value: 'failed', label: '退款失败', tag: 'danger' },
]

export const REFUND_STATUS_DICT = buildDictMap(REFUND_STATUS_OPTIONS)

/** 支付单是否已到终态：未完成的才需要关注是否会超时关单 */
export function isOpenPayment(status: PaymentStatus): boolean {
  return OPEN_PAYMENT_STATUSES.includes(status)
}

/* ------------------------------ 平台分账 ------------------------------ */

/**
 * 分账单状态。pending 待下发（渠道未就绪或未回调）、frozen 已冻结、
 * unfreezing 解冻中、unfrozen 已解冻、failed 失败（重试耗尽）。
 */
export const PROFIT_SHARE_STATUS_OPTIONS: readonly DictOption<ProfitShareStatus>[] = [
  { value: 'pending', label: '待下发', tag: 'info' },
  { value: 'frozen', label: '已冻结', tag: 'warning' },
  { value: 'unfreezing', label: '解冻中', tag: 'primary' },
  { value: 'unfrozen', label: '已解冻', tag: 'success' },
  { value: 'failed', label: '解冻失败', tag: 'danger' },
]

export const PROFIT_SHARE_STATUS_DICT = buildDictMap(PROFIT_SHARE_STATUS_OPTIONS)

/** 待解冻状态集合，与后端 OPEN_PROFIT_SHARE_STATUSES 口径一致 */
export const OPEN_PROFIT_SHARE_STATUSES: readonly ProfitShareStatus[] = [
  'pending',
  'frozen',
  'unfreezing',
]

/** 分账是否仍在等待解冻（T+1 到期由任务自动处理） */
export function isOpenProfitShare(status: ProfitShareStatus): boolean {
  return OPEN_PROFIT_SHARE_STATUSES.includes(status)
}

/* ------------------------------ 交易对账 ------------------------------ */

/**
 * 对账台账状态。pending_bill 渠道账单未出（会自动重试）、
 * balanced 账平、mismatch 有差异、failed 重试耗尽需人工。
 */
export const RECONCILE_STATUS_OPTIONS: readonly DictOption<ReconcileStatus>[] = [
  { value: 'pending_bill', label: '账单未出', tag: 'info' },
  { value: 'running', label: '对账中', tag: 'primary' },
  { value: 'balanced', label: '账平', tag: 'success' },
  { value: 'mismatch', label: '有差异', tag: 'danger' },
  { value: 'failed', label: '对账失败', tag: 'danger' },
]

export const RECONCILE_STATUS_DICT = buildDictMap(RECONCILE_STATUS_OPTIONS)

/** 未出结论的状态集合，与后端 OPEN_RECONCILE_STATUSES 口径一致 */
export const OPEN_RECONCILE_STATUSES: readonly ReconcileStatus[] = ['pending_bill', 'running']

export function isOpenReconcile(status: ReconcileStatus): boolean {
  return OPEN_RECONCILE_STATUSES.includes(status)
}

/**
 * 差异类型。标签刻意写成"运营看得懂的动作指向"而不是类型名，
 * 因为看这一列的人要决定的是"接下来去查什么"。
 */
export const RECONCILE_DIFF_TYPE_OPTIONS: readonly DictOption<ReconcileDiffType>[] = [
  { value: 'missing_local', label: '本地缺单', tag: 'danger' },
  { value: 'missing_channel', label: '渠道缺单', tag: 'warning' },
  { value: 'amount_mismatch', label: '金额不一致', tag: 'danger' },
  { value: 'trade_no_mismatch', label: '交易号不一致', tag: 'warning' },
  { value: 'duplicate_entry', label: '重复记账', tag: 'danger' },
]

export const RECONCILE_DIFF_TYPE_DICT = buildDictMap(RECONCILE_DIFF_TYPE_OPTIONS)

/* ------------------------------ 门店 ------------------------------ */

export const STORE_STATUS_OPTIONS: readonly DictOption<StoreStatus>[] = [
  { value: 'open', label: '营业中', tag: 'success' },
  { value: 'closed', label: '休息中', tag: 'info' },
]

export const STORE_STATUS_DICT = buildDictMap(STORE_STATUS_OPTIONS)

/* ------------------------------ 订单 ------------------------------ */

export const ORDER_STATUS_OPTIONS: readonly DictOption<OrderStatus>[] = [
  { value: 'pending', label: '待接单', tag: 'warning' },
  { value: 'accepted', label: '已接单', tag: 'primary' },
  { value: 'preparing', label: '备餐中', tag: 'primary' },
  { value: 'ready', label: '待取餐', tag: 'success' },
  { value: 'completed', label: '已完成', tag: 'success' },
  { value: 'cancelled', label: '已取消', tag: 'info' },
  { value: 'refunded', label: '已退款', tag: 'danger' },
]

export const ORDER_STATUS_DICT = buildDictMap(ORDER_STATUS_OPTIONS)

export const DINE_TYPE_OPTIONS: readonly DictOption<DineType>[] = [
  { value: 'dine_in', label: '堂食', tag: 'primary' },
  { value: 'takeout', label: '外卖', tag: 'warning' },
  { value: 'pickup', label: '自提', tag: 'success' },
]

export const DINE_TYPE_DICT = buildDictMap(DINE_TYPE_OPTIONS)

/* ------------------------------ 菜品 ------------------------------ */

export const DISH_STATUS_OPTIONS: readonly DictOption<DishStatus>[] = [
  { value: 'on_sale', label: '在售', tag: 'success' },
  { value: 'off_sale', label: '停售', tag: 'info' },
]

export const DISH_STATUS_DICT = buildDictMap(DISH_STATUS_OPTIONS)

export const DISH_STOCK_TYPE_OPTIONS: readonly DictOption<DishStockType>[] = [
  { value: 'unlimited', label: '不限量', tag: 'success' },
  { value: 'fixed', label: '固定库存', tag: 'warning' },
]

export const DISH_STOCK_TYPE_DICT = buildDictMap(DISH_STOCK_TYPE_OPTIONS)

/* ------------------------------ 会员 ------------------------------ */

export const MEMBER_LEVEL_OPTIONS: readonly DictOption<MemberLevel>[] = [
  { value: 'normal', label: '普通会员', tag: 'info' },
  { value: 'silver', label: '银卡会员', tag: 'primary' },
  { value: 'gold', label: '金卡会员', tag: 'warning' },
  { value: 'vip', label: 'VIP会员', tag: 'danger' },
]

export const MEMBER_LEVEL_DICT = buildDictMap(MEMBER_LEVEL_OPTIONS)

export const MEMBER_STATUS_OPTIONS: readonly DictOption<MemberStatus>[] = [
  { value: 'active', label: '正常', tag: 'success' },
  { value: 'disabled', label: '已禁用', tag: 'danger' },
]

export const MEMBER_STATUS_DICT = buildDictMap(MEMBER_STATUS_OPTIONS)

export const MEMBER_GENDER_OPTIONS: readonly DictOption<MemberGender>[] = [
  { value: 'unknown', label: '未知', tag: 'info' },
  { value: 'male', label: '男', tag: 'primary' },
  { value: 'female', label: '女', tag: 'danger' },
]

export const MEMBER_GENDER_DICT = buildDictMap(MEMBER_GENDER_OPTIONS)

/* ------------------------------ 商户员工 ------------------------------ */

export const STAFF_ROLE_OPTIONS: readonly DictOption<StaffRole>[] = [
  { value: 'owner', label: '店主', tag: 'danger' },
  { value: 'manager', label: '经理', tag: 'warning' },
  { value: 'cashier', label: '收银员', tag: 'primary' },
  { value: 'kitchen', label: '后厨', tag: 'success' },
  { value: 'waiter', label: '服务员', tag: 'info' },
]

export const STAFF_ROLE_DICT = buildDictMap(STAFF_ROLE_OPTIONS)

export const STAFF_STATUS_OPTIONS: readonly DictOption<StaffStatus>[] = [
  { value: 'active', label: '在职', tag: 'success' },
  { value: 'disabled', label: '已停用', tag: 'info' },
]

export const STAFF_STATUS_DICT = buildDictMap(STAFF_STATUS_OPTIONS)

/* ------------------------------ 到期预警 ------------------------------ */

/** 到期预警可选统计窗口（天） */
export const EXPIRING_DAY_OPTIONS: readonly number[] = [7, 30, 90]

/**
 * 剩余天数的紧急程度：已过期 / 3 天内最紧急，7 天内次紧急，其余按提醒处理。
 * daysLeft 为负数表示后端判定已过期。
 */
export function expiringTagType(daysLeft: number): TagType {
  if (daysLeft < 0) return 'danger'
  if (daysLeft <= 3) return 'danger'
  if (daysLeft <= 7) return 'warning'
  return 'primary'
}

export function expiringText(daysLeft: number): string {
  if (daysLeft < 0) return `已过期 ${Math.abs(daysLeft)} 天`
  if (daysLeft === 0) return '今天到期'
  return `剩余 ${daysLeft} 天`
}

/* ------------------------------ 小程序配置 ------------------------------ */

/** 配置来源标签，口径与支付渠道一致：后台保存的 / 回落 .env 的 / 完全没有 */
export const MINI_PROGRAM_CONFIG_SOURCE_OPTIONS: readonly DictOption<MiniProgramConfigSource>[] = [
  { value: 'database', label: '后台配置', tag: 'success' },
  { value: 'env', label: '环境变量兜底', tag: 'warning' },
  { value: 'none', label: '未配置', tag: 'info' },
]

export const MINI_PROGRAM_CONFIG_SOURCE_DICT = buildDictMap(MINI_PROGRAM_CONFIG_SOURCE_OPTIONS)

/**
 * 配置来源的可读说明：告诉运营「顾客登录现在用的到底是哪一份凭据」。
 * source=env 时页面回显的 AppID 其实是 .env 的兜底值，在本页保存才会写进数据库。
 */
export const MINI_PROGRAM_SOURCE_HINT: Readonly<Record<MiniProgramConfigSource, string>> = {
  database: '当前生效的凭据来自本页保存的配置。',
  env: '数据库里还没保存过 AppID，现在用的是 .env 兜底凭据；在本页保存后即以数据库为准。',
  none: '后台与 .env 都没有可用凭据，顾客无法登录小程序。',
}
