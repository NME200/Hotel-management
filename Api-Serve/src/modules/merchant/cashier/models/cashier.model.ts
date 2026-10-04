import type { MemberLevel, OrderStatus, PayStatus } from '../../../../common/constants/dict';
import type { PaymentChannel } from '../../../payment/constants/payment.constant';

/** 收银台按手机号认出的会员。刻意只回脱敏手机号与经营相关字段。 */
export interface CashierMemberView {
  customerId: number;
  /** 本店会员档案 ID；为 null 表示这个手机号还不是本店会员，只能按原价 */
  memberId: number | null;
  nickname: string;
  phoneMasked: string;
  isMember: boolean;
  level: MemberLevel | null;
  levelLabel: string | null;
  points: number | null;
  /** 储值余额（元），供收银员判断能否用余额收款 */
  balance: number | null;
  /** 给收银员看的一句话提示，例如「还不是本店会员，按原价结算」 */
  hint: string | null;
}

export interface CashierOrderLine {
  dishName: string;
  specDesc: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
}

/** 收银台建单结果：金额分项与明细都回给前端，收银员要照着念一遍金额。 */
export interface CashierOrderView {
  id: number;
  orderNo: string;
  dineType: string;
  dineTypeLabel: string;
  tableNo: string | null;
  peopleCount: number;
  memberId: number | null;
  memberNickname: string | null;
  dishAmount: number;
  packingAmount: number;
  deliveryAmount: number;
  discountAmount: number;
  payAmount: number;
  payStatus: PayStatus;
  status: OrderStatus;
  items: CashierOrderLine[];
}

/**
 * 下单前算价结果：只回金额与明细，不含订单号。
 *
 * 与建单结果的区别只有一个 —— 没落库。金额同样由后端算，
 * 所以收银员报给顾客的价与最终落库的价必然一致。
 */
export interface CashierPreviewView {
  lines: CashierOrderLine[];
  dishAmount: number;
  packingAmount: number;
  deliveryAmount: number;
  discountAmount: number;
  payAmount: number;
  /** 本单有行按会员价成交，收银台据此提示「已享会员价」 */
  memberPriced: boolean;
  /** 本单有行按活动价成交 */
  promotionPriced: boolean;
}

/**
 * 收银台可选的一种收款方式。
 *
 * 线下渠道（现金、收款码）恒可用；在线渠道要商户已开通且平台渠道开关打开才可用，
 * 不可用时带一句能照做的原因，而不是让收银员点了才发现失败。
 */
export interface CashierPaymentMethod {
  channel: PaymentChannel;
  label: string;
  available: boolean;
  reason: string | null;
  /** 现金需要收银台算找零，前端据此决定是否显示「实收 / 找零」两个输入框 */
  needChange: boolean;
}
