import type {
  DineType,
  OrderStatus,
  PayStatus,
} from '../../../common/constants/dict';
import type { UsableCouponView } from './client-coupon.model';

export interface ClientOrderItemView {
  id: number;
  dishId: number | null;
  dishName: string;
  dishImage: string | null;
  skuId: number | null;
  specDesc: string | null;
  unitPrice: number;
  quantity: number;
  totalAmount: number;
  remark: string | null;
}

export interface ClientOrderBriefView {
  orderNo: string;
  status: OrderStatus;
  statusLabel: string;
  payStatus: PayStatus;
  payStatusLabel: string;
  dineType: DineType;
  dineTypeLabel: string;
  tableNo: string | null;
  peopleCount: number;
  pickupCode: string | null;
  itemCount: number;
  /** 菜品金额（元），已含会员价与规格加料差价 */
  dishAmount: number;
  packingAmount: number;
  deliveryAmount: number;
  discountAmount: number;
  payAmount: number;
  remark: string | null;
  handleRemark: string | null;
  /**
   * 订单所属门店名/编号。
   *
   * 顾客账号跨店之后「我的订单」是全部门的单，没有这两个字段就分不清哪条是哪家店的；
   * 单店列表里它们为 null，前端据此决定要不要显示。
   */
  storeName: string | null;
  storeCode: string | null;
  createdAt: Date;
  acceptedAt: Date | null;
  readyAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  canCancel: boolean;
  canPay: boolean;
  /** 待支付且支付单还在有效期内时给出剩余秒数 */
  payRemainingSeconds: number | null;
  items: ClientOrderItemView[];
}

export interface OrderTraceStep {
  code: string;
  label: string;
  desc: string;
  done: boolean;
  current: boolean;
  at: Date | null;
}

export interface OrderEstimate {
  /** 预计出餐时长（分钟） */
  minutes: number;
  /** 还需等待的秒数，已过期为 0 */
  remainingSeconds: number;
  text: string;
}

/** 订单跟踪页视图：进度条四步 + 取餐码 + 出餐预估。 */
export interface ClientOrderTraceView extends ClientOrderBriefView {
  steps: OrderTraceStep[];
  estimate: OrderEstimate | null;
  /** 已退款/已取消时给顾客的说明文案 */
  closedTip: string | null;
}

export interface ClientCheckoutLine {
  dishId: number;
  dishName: string;
  dishImage: string | null;
  specDesc: string;
  unitPrice: number;
  quantity: number;
  totalAmount: number;
  memberPriced: boolean;
  /** 活动价与会员价取低后由哪一方生效，结算页据此标「已享活动价」 */
  promotionPriced: boolean;
  promotionBadge: string | null;
}

/** 结算页一次性返回：明细 + 金额构成 + 本单可用券，前端不再自己算钱。 */
export interface ClientCheckoutView {
  lines: ClientCheckoutLine[];
  dishAmount: number;
  packingAmount: number;
  deliveryAmount: number;
  discountAmount: number;
  payAmount: number;
  usedCoupon: { id: number; name: string; discountAmount: number } | null;
  usableCoupons: UsableCouponView[];
  storeOpen: boolean;
  storeClosedTip: string | null;
  tips: string[];
}
