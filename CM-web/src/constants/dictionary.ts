import type {
  DineType,
  OrderStatus,
  PayStatus,
  TableDiningStatus,
} from '@/api/types/order'
import type { PaymentChannel } from '@/api/types/cashier'

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

/* ------------------------------ 就餐方式 ------------------------------ */

export const DINE_TYPE_OPTIONS: readonly DictOption<DineType>[] = [
  { value: 'dine_in', label: '堂食', tag: 'primary' },
  { value: 'takeout', label: '外送', tag: 'warning' },
  { value: 'pickup', label: '自取', tag: 'success' },
]

export const DINE_TYPE_DICT = buildDictMap(DINE_TYPE_OPTIONS)

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

/** 正向流转顺序，收银台按此顺序提供「下一步」按钮 */
export const ORDER_STATUS_FLOW: readonly OrderStatus[] = [
  'pending',
  'accepted',
  'preparing',
  'ready',
  'completed',
]

export function nextOrderStatus(status: OrderStatus): OrderStatus | null {
  const index = ORDER_STATUS_FLOW.indexOf(status)
  if (index < 0 || index >= ORDER_STATUS_FLOW.length - 1) return null
  return ORDER_STATUS_FLOW[index + 1] ?? null
}

export const PAY_STATUS_OPTIONS: readonly DictOption<PayStatus>[] = [
  { value: 'unpaid', label: '待支付', tag: 'danger' },
  { value: 'paid', label: '已支付', tag: 'success' },
  { value: 'partially_refunded', label: '部分退款', tag: 'warning' },
  { value: 'refunded', label: '已退款', tag: 'info' },
]

export const PAY_STATUS_DICT = buildDictMap(PAY_STATUS_OPTIONS)

/* ------------------------------ 桌位 ------------------------------ */

export const TABLE_DINING_STATUS_OPTIONS: readonly DictOption<TableDiningStatus>[] = [
  { value: 'idle', label: '空闲', tag: 'info' },
  { value: 'dining', label: '用餐中', tag: 'success' },
]

export const TABLE_DINING_STATUS_DICT = buildDictMap(TABLE_DINING_STATUS_OPTIONS)

export const TABLE_STATUS_OPTIONS: readonly DictOption<'active' | 'disabled'>[] = [
  { value: 'active', label: '启用', tag: 'success' },
  { value: 'disabled', label: '停用', tag: 'info' },
]

export const TABLE_STATUS_DICT = buildDictMap(TABLE_STATUS_OPTIONS)

/* ------------------------------ 收款渠道 ------------------------------ */

export const PAYMENT_CHANNEL_LABELS: Record<PaymentChannel, string> = {
  cash: '现金',
  offline: '收款码',
  wechat: '微信支付',
  alipay: '支付宝',
  mock: '模拟支付',
}

/** 线下渠道（现金 / 收款码）的配色，收银台按钮按此区分主次 */
export const OFFLINE_CHANNELS: readonly PaymentChannel[] = ['cash', 'offline']

/* ------------------------------ 打印 ------------------------------ */

export const PRINT_TICKET_TYPE_OPTIONS: readonly DictOption<'customer' | 'kitchen'>[] = [
  { value: 'customer', label: '顾客小票', tag: 'primary' },
  { value: 'kitchen', label: '后厨小票', tag: 'warning' },
]

export const PRINT_TICKET_TYPE_DICT = buildDictMap(PRINT_TICKET_TYPE_OPTIONS)

/** 单次最多打印份数，与后端 PRINT_MAX_COPIES 保持一致 */
export const PRINT_MAX_COPIES = 5
