import type { CouponSource, MemberCouponStatus } from '../../../common/constants/dict';

/** 结算页算优惠要用到的最小行信息，由下单服务从购物车快照转换而来。 */
export interface CouponLineInput {
  dishId: number;
  categoryId: number;
  /** 该行小计（分） */
  totalCents: number;
}

/** 券卡片视图：文案字段由后端一次算好，前端不再拼「满 39 可用」这类字符串。 */
export interface ClientCouponView {
  id: number;
  couponNo: string;
  name: string;
  type: 'reduction' | 'discount';
  /** 满减面额（元），折扣券为 null */
  amount: number | null;
  /** 折扣（如 8.8 表示 8.8 折），满减券为 null */
  discount: number | null;
  /** 券面左侧大字：¥8 / 8.8折 */
  faceText: string;
  /** 门槛（元） */
  threshold: number;
  /** 门槛文案：无门槛 / 满 39 元可用 */
  thresholdText: string;
  description: string | null;
  validFrom: Date;
  validTo: Date;
  /** 有效期文案：2026-10-08 前有效 */
  validText: string;
  status: MemberCouponStatus;
  source: CouponSource;
  /** 全场通用 / 限指定分类 / 限指定菜品 */
  scopeText: string;
  usedAt: Date | null;
  orderId: number | null;
}

/** 结算页的可选券：额外带「本单能用吗、能减多少」。 */
export interface UsableCouponView extends ClientCouponView {
  usable: boolean;
  /** 本单可优惠金额（元），不可用时为 0 */
  discountAmount: number;
  unusableReason: string | null;
}

/** 领券中心的模板条目。 */
export interface ClaimableCouponView {
  templateId: number;
  name: string;
  type: 'reduction' | 'discount';
  faceText: string;
  thresholdText: string;
  description: string | null;
  validText: string;
  scopeText: string;
  /** 剩余可领，-1 表示不限 */
  remaining: number;
  /** 当前会员是否还能领（已达每人限领数则为 false） */
  claimable: boolean;
  claimTip: string | null;
}
