import { MemberLevel } from '../../../common/constants/dict';
import type { GrowthTask, MemberBenefit } from '../models/client-member.model';

/**
 * 会员权益与成长任务的展示口径。
 *
 * 只描述「本系统真的能兑现」的部分：会员价有 dish.memberPrice 支撑，
 * 成长值有 member.growth_value 支撑，优惠券有 member_coupon 支撑。
 * 生日免单、专属折扣这类没有实现支撑的文案不写进来，
 * 前端也就不会多出一个点了没反应的入口。
 */
export const MEMBER_BENEFITS: Record<MemberLevel, readonly MemberBenefit[]> = {
  [MemberLevel.Normal]: [
    { code: 'member_price', name: '会员价', icon: 'price', desc: '部分菜品享会员价' },
    { code: 'points', name: '消费积分', icon: 'points', desc: '消费 1 元积 1 分' },
    { code: 'member_day', name: '会员日', icon: 'calendar', desc: '每月 8/18/28 日成长翻倍' },
    { code: 'coupon', name: '优惠券', icon: 'ticket', desc: '可领店铺代金券' },
  ],
  [MemberLevel.Silver]: [
    { code: 'member_price', name: '会员价', icon: 'price', desc: '会员价菜品更全' },
    { code: 'points', name: '消费积分', icon: 'points', desc: '消费 1 元积 1 分' },
    { code: 'member_day', name: '会员日', icon: 'calendar', desc: '每月 8/18/28 日成长翻倍' },
    { code: 'priority', name: '优先出餐', icon: 'bolt', desc: '同档位订单优先排单' },
  ],
  [MemberLevel.Gold]: [
    { code: 'member_price', name: '会员价', icon: 'price', desc: '全部会员价菜品' },
    { code: 'points', name: '消费积分', icon: 'points', desc: '消费 1 元积 1 分' },
    { code: 'member_day', name: '会员日', icon: 'calendar', desc: '每月 8/18/28 日成长翻倍' },
    { code: 'priority', name: '优先出餐', icon: 'bolt', desc: '同档位订单优先排单' },
  ],
  [MemberLevel.Vip]: [
    { code: 'member_price', name: '会员价', icon: 'price', desc: '全部会员价菜品' },
    { code: 'points', name: '消费积分', icon: 'points', desc: '消费 1 元积 1 分' },
    { code: 'member_day', name: '会员日', icon: 'calendar', desc: '每月 8/18/28 日成长翻倍' },
    { code: 'service', name: '专属客服', icon: 'service', desc: '门店电话优先接听' },
  ],
};

/** 任务机器码：发奖点与前端展示共用同一份，不靠文案匹配。 */
export const GrowthTaskCode = {
  BindPhone: 'bind_phone',
  FirstOrder: 'first_order',
  ThreeOrders: 'three_orders',
  FirstCouponUsed: 'first_coupon_used',
} as const;
export type GrowthTaskCode = (typeof GrowthTaskCode)[keyof typeof GrowthTaskCode];

interface GrowthTaskRule {
  code: GrowthTaskCode;
  name: string;
  desc: string;
  icon: string;
  rewardGrowth: number;
  target: number;
  action: string;
}

export const GROWTH_TASK_RULES: readonly GrowthTaskRule[] = [
  {
    code: GrowthTaskCode.BindPhone,
    name: '完善会员资料',
    desc: '绑定手机号，方便门店联系你',
    icon: 'profile',
    rewardGrowth: 50,
    target: 1,
    action: 'profile',
  },
  {
    code: GrowthTaskCode.FirstOrder,
    name: '完成首单',
    desc: '在本店完成第一笔订单',
    icon: 'order',
    rewardGrowth: 100,
    target: 1,
    action: 'menu',
  },
  {
    code: GrowthTaskCode.ThreeOrders,
    name: '累计下单 3 笔',
    desc: '累计完成 3 笔订单',
    icon: 'orders',
    rewardGrowth: 150,
    target: 3,
    action: 'menu',
  },
  {
    code: GrowthTaskCode.FirstCouponUsed,
    name: '使用一张优惠券',
    desc: '结算时勾选优惠券即自动核销',
    icon: 'ticket',
    rewardGrowth: 60,
    target: 1,
    action: 'coupon',
  },
];

function rewardOf(code: GrowthTaskCode): number {
  return GROWTH_TASK_RULES.find((rule) => rule.code === code)?.rewardGrowth ?? 0;
}

/**
 * 任务奖励的发放口径：计数器「正好达到」目标值的那一刻发一次。
 * 这样既不需要额外的领奖流水表，也不可能被重复点击刷奖。
 */
export function taskRewardFor(
  orderCount: number,
  usedCouponCount: number,
  phoneJustBound: boolean,
): number {
  let reward = 0;
  if (phoneJustBound) {
    reward += rewardOf(GrowthTaskCode.BindPhone);
  }
  if (orderCount === 1) {
    reward += rewardOf(GrowthTaskCode.FirstOrder);
  }
  if (orderCount === 3) {
    reward += rewardOf(GrowthTaskCode.ThreeOrders);
  }
  if (usedCouponCount === 1) {
    reward += rewardOf(GrowthTaskCode.FirstCouponUsed);
  }
  return reward;
}

export function buildGrowthTasks(
  orderCount: number,
  usedCouponCount: number,
  phoneBound: boolean,
): GrowthTask[] {
  const currentOf = (code: GrowthTaskCode): number => {
    if (code === GrowthTaskCode.BindPhone) {
      return phoneBound ? 1 : 0;
    }
    if (code === GrowthTaskCode.FirstCouponUsed) {
      return usedCouponCount;
    }
    return orderCount;
  };

  return GROWTH_TASK_RULES.map((rule) => {
    const current = currentOf(rule.code);
    return {
      code: rule.code,
      name: rule.name,
      desc: rule.desc,
      icon: rule.icon,
      rewardGrowth: rule.rewardGrowth,
      target: rule.target,
      current: Math.min(current, rule.target),
      done: current >= rule.target,
      action: rule.action,
    };
  });
}
