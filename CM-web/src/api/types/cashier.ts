import type { DineType, OrderStatus, PayStatus } from './order'

export type PaymentChannel = 'cash' | 'offline' | 'wechat' | 'alipay' | 'mock'

export type MemberLevel = 'normal' | 'silver' | 'gold' | 'vip'

/** 收银台可选的一种收款方式 */
export interface CashierPaymentMethod {
  channel: PaymentChannel
  label: string
  available: boolean
  /** 不可用时的原因，可直接展示给收银员 */
  reason: string | null
  /** 现金需要算找零，前端据此显示「实收 / 找零」 */
  needChange: boolean
}

/** 按手机号认出的会员 */
export interface CashierMemberView {
  customerId: number
  /** 为 null 表示这个手机号还不是本店会员，只能按原价 */
  memberId: number | null
  nickname: string
  phoneMasked: string
  isMember: boolean
  level: MemberLevel | null
  levelLabel: string | null
  points: number | null
  balance: number | null
  hint: string | null
}

/** 下单时的加料/口味选择，与顾客端同一套结构 */
export interface OrderOptionSelectionInput {
  groupId: number
  optionNames: string[]
}

export interface CashierOrderItemInput {
  dishId: number
  skuId?: number
  optionSelections?: OrderOptionSelectionInput[]
  quantity: number
}

/** POST /merchant/cashier/orders 请求体：只报「点了什么」，金额一律后端算 */
export interface CreateCashierOrderInput {
  dineType: DineType
  tableId?: number
  memberId?: number
  peopleCount?: number
  remark?: string
  items: CashierOrderItemInput[]
}

export interface CashierOrderLine {
  dishName: string
  specDesc: string
  quantity: number
  unitPrice: number
  totalAmount: number
}

/** 建单结果：收银员要照着念一遍金额，所以分项与明细都回 */
export interface CashierOrderView {
  id: number
  orderNo: string
  dineType: DineType
  dineTypeLabel: string
  tableNo: string | null
  peopleCount: number
  memberId: number | null
  memberNickname: string | null
  dishAmount: number
  packingAmount: number
  deliveryAmount: number
  discountAmount: number
  payAmount: number
  payStatus: PayStatus
  status: OrderStatus
  items: CashierOrderLine[]
}

/** 下单前算价结果：与建单同一套后端算价，只是不落库 */
export interface CashierPreviewView {
  lines: CashierOrderLine[]
  dishAmount: number
  packingAmount: number
  deliveryAmount: number
  discountAmount: number
  payAmount: number
  memberPriced: boolean
  promotionPriced: boolean
}

/** POST /merchant/payments 请求体（结账复用支付域，不另写收款逻辑） */
export interface CreatePaymentInput {
  orderId: number
  channel: PaymentChannel
  payerId?: string
}

/** 支付单对外视图（后端 PaymentView）：金额以「元」返回，内部一律用分 */
export interface PaymentView {
  id: number
  merchantId: number
  orderId: number
  paymentNo: string
  channel: PaymentChannel
  tradeNo: string | null
  amount: number
  refundedAmount: number
  status: 'created' | 'paying' | 'succeeded' | 'failed' | 'closed'
  expireAt: string
  paidAt: string | null
  closedAt: string | null
  failureReason: string | null
  createdAt: string
}

/** 退款单对外视图（后端 RefundView） */
export interface RefundView {
  id: number
  refundNo: string
  paymentId: number
  orderId: number
  channel: PaymentChannel
  amount: number
  status: 'processing' | 'succeeded' | 'failed'
  reason: string | null
  operatorName: string | null
  succeededAt: string | null
  createdAt: string
}
