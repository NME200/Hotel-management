import type { PageQuery } from './common'

export type DineType = 'dine_in' | 'takeout' | 'pickup'

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'refunded'

export type PayStatus = 'unpaid' | 'paid' | 'partially_refunded' | 'refunded'

/** 桌位的用餐状态，与「启用/停用」正交 */
export type TableDiningStatus = 'idle' | 'dining'

export type DishStatus = 'on_sale' | 'off_sale'

export type DishStockType = 'unlimited' | 'fixed'

export type OptionGroupType = 'single' | 'multi'

export type CategoryStatus = 'enabled' | 'disabled'

export type TableStatus = 'active' | 'disabled'

/** 后端 Order 实体（收银台只用到这些字段） */
export interface OrderItem {
  id: number
  merchantId: number
  orderNo: string
  pickupCode: string | null
  memberId: number | null
  memberNickname: string | null
  dineType: DineType
  status: OrderStatus
  tableNo: string | null
  peopleCount: number
  dishAmount: number
  packingAmount: number
  deliveryAmount: number
  discountAmount: number
  payAmount: number
  payStatus: PayStatus
  remark: string | null
  handleRemark: string | null
  acceptedAt: string | null
  readyAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  createdAt: string
  updatedAt: string
  itemCount: number
}

export interface OrderSummary {
  orderCount: number
  turnover: number
  pendingCount: number
  completedCount: number
  cancelledCount: number
  /** 还活着但没收到钱的单，收银台顶部「待收款」用它 */
  unpaidCount: number
}

export interface OrderQuery extends PageQuery {
  status?: OrderStatus
  dineType?: DineType
  from?: string
  to?: string
}

export interface UpdateOrderStatusInput {
  status: OrderStatus
  remark?: string
}

/** 分类（收银台左栏） */
export interface CategoryItem {
  id: number
  merchantId: number
  name: string
  sort: number
  status: CategoryStatus
  image: string | null
}

/** 菜品规格 */
export interface DishSku {
  id: number
  dishId: number
  name: string
  price: number
  specDesc: string | null
  stock: number | null
  sort: number
}

export interface DishOptionItem {
  name: string
  priceDelta: number
  sort?: number
}

/** 加料/口味分组 */
export interface DishOptionGroup {
  id: number
  dishId: number
  name: string
  type: OptionGroupType
  required: boolean
  sort: number
  options: DishOptionItem[]
}

/** 菜品（列表） */
export interface DishItem {
  id: number
  merchantId: number
  categoryId: number
  categoryName: string
  name: string
  subtitle: string | null
  image: string | null
  description: string | null
  price: number
  memberPrice: number | null
  unit: string
  stockType: DishStockType
  stock: number | null
  salesCount: number
  sort: number
  isRecommend: boolean
  tags: string[]
  status: DishStatus
  /** 有规格或加料分组：必须先选清楚才能加购 */
  needChoose: boolean
}

/** 菜品详情：列表字段 + 规格 + 加料分组 */
export interface DishDetail extends DishItem {
  skus: DishSku[]
  optionGroups: DishOptionGroup[]
}
