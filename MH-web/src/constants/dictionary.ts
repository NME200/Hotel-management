import { formatMoney } from '@/utils/format'

import type {
  CategoryStatus,
} from '@/api/types/category'
import type {
  Activity,
  ActivityAction,
  ActivitySlot,
  ActivityStatus,
} from '@/api/types/activity'
import type {
  DishOptionType,
  DishStatus,
  DishStockType,
} from '@/api/types/dish'
import type {
  Promotion,
  PromotionScopeType,
  PromotionStatus,
  PromotionType,
} from '@/api/types/promotion'
import type {
  DineType,
  OrderStatus,
} from '@/api/types/order'
import type { StaffRole } from '@/api/types/auth'
import type { StaffStatus } from '@/api/types/staff'
import type { StoreStatus } from '@/api/types/store'
import type { TableStatus } from '@/api/types/table'
import type { MerchantPaymentStatus, PaymentChannel } from '@/api/types/payment'
import type {
  PrintMode,
  PrintPaperSize,
  PrinterStatus,
  PrintProvider,
  PrintTaskStatus,
  PrintTicketType,
} from '@/api/types/print'

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

/** 正向流转顺序，列表页的推进按钮按此顺序取下一个状态 */
export const ORDER_STATUS_FLOW: readonly OrderStatus[] = [
  'pending',
  'accepted',
  'preparing',
  'ready',
  'completed',
]

export const ORDER_FLOW_TERMINAL_STATUS: readonly OrderStatus[] = ['completed', 'cancelled', 'refunded']

/** 允许整单取消的状态 */
export const CANCELLABLE_ORDER_STATUS: readonly OrderStatus[] = [
  'pending',
  'accepted',
  'preparing',
  'ready',
]

export function nextOrderStatus(status: OrderStatus): OrderStatus | null {
  const index = ORDER_STATUS_FLOW.indexOf(status)
  if (index < 0 || index >= ORDER_STATUS_FLOW.length - 1) return null
  return ORDER_STATUS_FLOW[index + 1] ?? null
}

export function canAdvanceOrder(status: OrderStatus): boolean {
  return nextOrderStatus(status) !== null
}

export function canCancelOrder(status: OrderStatus): boolean {
  return CANCELLABLE_ORDER_STATUS.includes(status)
}

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

export const DISH_OPTION_TYPE_OPTIONS: readonly DictOption<DishOptionType>[] = [
  { value: 'single', label: '单选', tag: 'primary' },
  { value: 'multi', label: '多选', tag: 'success' },
]

export const DISH_OPTION_TYPE_DICT = buildDictMap(DISH_OPTION_TYPE_OPTIONS)

/** 常用标签候选，配合 el-select 的 allow-create 使用 */
export const DISH_TAG_PRESETS: readonly string[] = [
  '招牌',
  '辣',
  '不辣',
  '微辣',
  '素食',
  '海鲜',
  '小吃',
  '饮品',
  '主食',
  '限时',
]

/** 菜品单位候选 */
export const DISH_UNIT_PRESETS: readonly string[] = ['份', '例', '杯', '碗', '盘', '串', '斤', '两', '个']

/* ---------------------------- 运营位活动 ---------------------------- */

export const ACTIVITY_STATUS_OPTIONS: readonly DictOption<ActivityStatus>[] = [
  { value: 'enabled', label: '启用', tag: 'success' },
  { value: 'disabled', label: '停用', tag: 'info' },
]
export const ACTIVITY_STATUS_DICT = buildDictMap(ACTIVITY_STATUS_OPTIONS)

/** 展示位文案要交代清楚顾客端落在哪一页，商户才知道该往哪填 */
export const ACTIVITY_SLOT_OPTIONS: readonly DictOption<ActivitySlot>[] = [
  { value: 'home', label: '首页 Banner', tag: 'primary' },
  { value: 'mine', label: '「我的」页色块', tag: 'warning' },
  { value: 'member', label: '会员中心活动区', tag: 'success' },
]
export const ACTIVITY_SLOT_DICT = buildDictMap(ACTIVITY_SLOT_OPTIONS)

export const ACTIVITY_ACTION_OPTIONS: readonly DictOption<ActivityAction>[] = [
  { value: 'none', label: '不跳转', tag: 'info' },
  { value: 'coupons', label: '领券中心', tag: 'primary' },
  { value: 'menu', label: '点餐页', tag: 'primary' },
  { value: 'member', label: '会员中心', tag: 'success' },
  { value: 'promotion', label: '限时活动（只看参与菜品）', tag: 'danger' },
  { value: 'stores', label: '门店列表', tag: 'warning' },
  { value: 'search', label: '搜索页', tag: 'warning' },
]
export const ACTIVITY_ACTION_DICT = buildDictMap(ACTIVITY_ACTION_OPTIONS)

/** 图标只给顾客端能映射成汉字的那几个码，配错了小程序会退回默认字符 */
export const ACTIVITY_ICON_OPTIONS: readonly DictOption<string>[] = [
  { value: '', label: '不显示图标', tag: 'info' },
  { value: 'calendar', label: '日 · 会员/日期', tag: 'primary' },
  { value: 'ticket', label: '券 · 优惠', tag: 'primary' },
  { value: 'bolt', label: '快 · 限时', tag: 'warning' },
  { value: 'points', label: '分 · 积分成长', tag: 'success' },
  { value: 'price', label: '¥ · 价格', tag: 'danger' },
  { value: 'order', label: '单 · 订单', tag: 'info' },
]

/**
 * 卡片此刻在顾客端到底显不显示。
 * 停用、或还没到 startsAt、或已过 endsAt，三种情况都看不到，
 * 列表里要一眼分清「已停用」和「未到时间」，否则商户会反复改时间。
 */
export function activityVisible(row: Activity, now: number = Date.now()): boolean {
  if (row.status !== 'enabled') return false
  const from = row.startsAt ? new Date(row.startsAt).getTime() : null
  const to = row.endsAt ? new Date(row.endsAt).getTime() : null
  if (from !== null && now < from) return false
  if (to !== null && now > to) return false
  return true
}

export function activityPhase(row: Activity): DictOption {
  if (row.status !== 'enabled') return ACTIVITY_STATUS_DICT.disabled
  if (row.startsAt && new Date(row.startsAt).getTime() > Date.now()) {
    return { value: 'pending', label: '未到时间', tag: 'warning' }
  }
  if (row.endsAt && new Date(row.endsAt).getTime() < Date.now()) {
    return { value: 'ended', label: '已过期', tag: 'info' }
  }
  return ACTIVITY_STATUS_DICT.enabled
}

/* ---------------------------- 限时活动 ---------------------------- */

export const PROMOTION_STATUS_OPTIONS: readonly DictOption<PromotionStatus>[] = [
  { value: 'enabled', label: '启用', tag: 'success' },
  { value: 'disabled', label: '停用', tag: 'info' },
]
export const PROMOTION_STATUS_DICT = buildDictMap(PROMOTION_STATUS_OPTIONS)

/** 两种算法在顾客端得到的是同一个价，但配置时要想的数不一样，所以标签要写全 */
export const PROMOTION_TYPE_OPTIONS: readonly DictOption<PromotionType>[] = [
  { value: 'price', label: '活动价', tag: 'danger' },
  { value: 'discount', label: '折扣', tag: 'warning' },
]
export const PROMOTION_TYPE_DICT = buildDictMap(PROMOTION_TYPE_OPTIONS)

export const PROMOTION_SCOPE_OPTIONS: readonly DictOption<PromotionScopeType>[] = [
  { value: 'all', label: '全部菜品', tag: 'primary' },
  { value: 'category', label: '按分类', tag: 'success' },
  { value: 'dish', label: '按菜品', tag: 'warning' },
]
export const PROMOTION_SCOPE_DICT = buildDictMap(PROMOTION_SCOPE_OPTIONS)

/** 顾客嘴里的「6 折」就是实付比例乘 10，去掉多余的小数位 */
export function promotionFoldText(ratio: string | number | null | undefined): string {
  const value = typeof ratio === 'string' ? Number.parseFloat(ratio) : ratio
  if (value === null || value === undefined || Number.isNaN(value) || value <= 0) return '--'
  return String(Number((value * 10).toFixed(2)))
}

/**
 * 优惠方式一栏的文案。库里存的是分与实付比例，直接给商户看会读不懂。
 * 传了菜品原价时，活动价不低于原价就写明不会生效，否则商户以为已经改过价。
 */
export function promotionPriceText(row: Promotion, originalPrice?: number | null): string {
  if (row.type === 'discount') {
    const fold = promotionFoldText(row.discountRatio)
    return fold === '--' ? '折扣未配置' : `${fold} 折`
  }
  if (row.priceCents === null) return '活动价未配置'
  const price = row.priceCents / 100
  const text = `活动价 ${formatMoney(price)}`
  if (typeof originalPrice === 'number' && price >= originalPrice) {
    return `${text}（不低于原价，不会生效）`
  }
  return text
}

/** 范围只报数量不报名字：名单可能很长，具体是哪几个留给编辑弹窗 */
export function promotionScopeText(row: Promotion): string {
  if (row.scopeType === 'all') return '全部菜品'
  return `${row.scopeIds?.length ?? 0} 个${row.scopeType === 'category' ? '分类' : '菜品'}`
}

/**
 * 此刻到底有没有按活动价结算。
 * 停用、还没到 startsAt、已过 endsAt 三种情况下顾客都按原价付，
 * 列表里要分清「已停用」和「未到时间」，商户才知道该动的是开关还是时间。
 */
export function promotionActive(row: Promotion, now: number = Date.now()): boolean {
  if (row.status !== 'enabled') return false
  const from = row.startsAt ? new Date(row.startsAt).getTime() : null
  const to = row.endsAt ? new Date(row.endsAt).getTime() : null
  if (from !== null && now < from) return false
  if (to !== null && now > to) return false
  return true
}

export function promotionPhase(row: Promotion): DictOption {
  if (row.status !== 'enabled') return PROMOTION_STATUS_DICT.disabled
  if (row.startsAt && new Date(row.startsAt).getTime() > Date.now()) {
    return { value: 'pending', label: '未到时间', tag: 'warning' }
  }
  if (row.endsAt && new Date(row.endsAt).getTime() < Date.now()) {
    return { value: 'ended', label: '已过期', tag: 'info' }
  }
  return PROMOTION_STATUS_DICT.enabled
}

/* ------------------------------ 分类 / 门店 ------------------------------ */

export const CATEGORY_STATUS_OPTIONS: readonly DictOption<CategoryStatus>[] = [
  { value: 'enabled', label: '启用', tag: 'success' },
  { value: 'disabled', label: '停用', tag: 'info' },
]

export const CATEGORY_STATUS_DICT = buildDictMap(CATEGORY_STATUS_OPTIONS)

export const STORE_STATUS_OPTIONS: readonly DictOption<StoreStatus>[] = [
  { value: 'open', label: '营业中', tag: 'success' },
  { value: 'closed', label: '休息中', tag: 'info' },
]

export const STORE_STATUS_DICT = buildDictMap(STORE_STATUS_OPTIONS)

/* ------------------------------ 员工 ------------------------------ */

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

/* ------------------------------ 收款 / 支付进件 ------------------------------ */

/** 渠道卡片的固定展示顺序，后端返回顺序变化时前端仍稳定 */
export const PAYMENT_CHANNEL_ORDER: readonly PaymentChannel[] = ['wechat', 'alipay', 'mock']

export const PAYMENT_CHANNEL_OPTIONS: readonly DictOption<PaymentChannel>[] = [
  { value: 'wechat', label: '微信支付', tag: 'success' },
  { value: 'alipay', label: '支付宝', tag: 'primary' },
  { value: 'mock', label: '模拟支付', tag: 'info' },
]

export const PAYMENT_CHANNEL_DICT = buildDictMap(PAYMENT_CHANNEL_OPTIONS)

export const MERCHANT_PAYMENT_STATUS_OPTIONS: readonly DictOption<MerchantPaymentStatus>[] = [
  { value: 'not_applied', label: '未申请', tag: 'info' },
  { value: 'pending_audit', label: '待审核', tag: 'primary' },
  { value: 'enabled', label: '已开通', tag: 'success' },
  { value: 'rejected', label: '已驳回', tag: 'danger' },
  { value: 'disabled', label: '已停用', tag: 'warning' },
]

export const MERCHANT_PAYMENT_STATUS_DICT = buildDictMap(MERCHANT_PAYMENT_STATUS_OPTIONS)

/* ------------------------------ 小票打印 ------------------------------ */

export const PRINT_TICKET_TYPE_OPTIONS: readonly DictOption<PrintTicketType>[] = [
  { value: 'customer', label: '顾客小票', tag: 'primary' },
  { value: 'kitchen', label: '后厨小票', tag: 'warning' },
]

export const PRINT_TICKET_TYPE_DICT = buildDictMap(PRINT_TICKET_TYPE_OPTIONS)

export const PRINT_MODE_OPTIONS: readonly DictOption<PrintMode>[] = [
  { value: 'browser', label: '浏览器小票机', tag: 'primary' },
  { value: 'cloud', label: '云打印机', tag: 'success' },
]

export const PRINT_MODE_DICT = buildDictMap(PRINT_MODE_OPTIONS)

export const PRINT_PAPER_SIZE_OPTIONS: readonly { value: PrintPaperSize; label: string }[] = [
  { value: '80mm', label: '80mm（收银台常用）' },
  { value: '58mm', label: '58mm（小型机）' },
]

export const PRINT_TASK_STATUS_OPTIONS: readonly DictOption<PrintTaskStatus>[] = [
  { value: 'pending', label: '待打印', tag: 'warning' },
  { value: 'success', label: '已打印', tag: 'success' },
  { value: 'failed', label: '打印失败', tag: 'danger' },
]

export const PRINT_TASK_STATUS_DICT = buildDictMap(PRINT_TASK_STATUS_OPTIONS)

export const PRINTER_STATUS_OPTIONS: readonly DictOption<PrinterStatus>[] = [
  { value: 'active', label: '启用', tag: 'success' },
  { value: 'disabled', label: '停用', tag: 'info' },
]

export const PRINTER_STATUS_DICT = buildDictMap(PRINTER_STATUS_OPTIONS)

export const PRINT_PROVIDER_OPTIONS: readonly { value: PrintProvider; label: string }[] = [
  { value: 'feie', label: '飞鹅' },
  { value: 'yilianyun', label: '易联云' },
]

export const PRINT_PROVIDER_LABEL: Record<PrintProvider, string> = {
  feie: '飞鹅',
  yilianyun: '易联云',
}

/** 触发来源文案，打印流水里直接展示 */
export const PRINT_TRIGGER_LABEL: Record<string, string> = {
  auto: '自动打印',
  manual: '手动打印',
  retry: '失败重试',
}

/** 自动打印时机候选项 */
export const AUTO_PRINT_ON_OPTIONS: readonly { value: 'accepted' | 'ready'; label: string }[] = [
  { value: 'accepted', label: '接单后立即打印' },
  { value: 'ready', label: '出餐时打印' },
]

/** 单次最多打印份数，与后端 PRINT_MAX_COPIES 保持一致 */
export const PRINT_MAX_COPIES = 5

/* ------------------------------ 桌位 ------------------------------ */

export const TABLE_STATUS_OPTIONS: readonly DictOption<TableStatus>[] = [
  { value: 'active', label: '启用', tag: 'success' },
  { value: 'disabled', label: '停用', tag: 'info' },
]

export const TABLE_STATUS_DICT = buildDictMap(TABLE_STATUS_OPTIONS)

/** 单次批量建桌上限，与后端 TABLE_BATCH_MAX 保持一致 */
export const TABLE_BATCH_MAX = 50
