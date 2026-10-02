/**
 * 会员成长规则：消费如何换算成长值、会员日是哪几天。
 *
 * 放在 common 而不是小程序模块里，是因为发放点在商家端订单状态机
 * （订单完成那一刻），展示点在顾客端，两处必须读同一份规则。
 */

/** 每月这几天是会员日：当天完成订单的成长值翻倍。 */
export const MEMBER_DAY_OF_MONTH = [8, 18, 28];

/** 会员日之外的基础换算：消费 1 元 = 1 点成长值。 */
export const BASE_GROWTH_PER_YUAN = 1;
export const MEMBER_DAY_MULTIPLIER = 2;

export interface MemberDayInfo {
  /** 今天是否会员日 */
  isMemberDay: boolean;
  /** 当月会员日，供「每月 8/18/28 日」文案使用 */
  memberDays: number[];
  /** 下一个会员日距今天数，当天为 0 */
  daysUntilNext: number;
  /** 当天每消费 1 元可得多少成长值 */
  rewardPerYuan: number;
}

export function memberDayInfo(date: Date = new Date()): MemberDayInfo {
  const day = date.getDate();
  const isMemberDay = MEMBER_DAY_OF_MONTH.includes(day);
  const upcoming = MEMBER_DAY_OF_MONTH.find((item) => item > day);
  const monthLength = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const firstNextMonthDay = MEMBER_DAY_OF_MONTH[0]!;

  return {
    isMemberDay,
    memberDays: [...MEMBER_DAY_OF_MONTH],
    daysUntilNext: isMemberDay ? 0 : upcoming ? upcoming - day : monthLength - day + firstNextMonthDay,
    rewardPerYuan: isMemberDay
      ? BASE_GROWTH_PER_YUAN * MEMBER_DAY_MULTIPLIER
      : BASE_GROWTH_PER_YUAN,
  };
}

/**
 * 金额（分）换算成长值：向下取整到元再乘系数。
 * 传进来的一定是整数分，避免在成长值这条链路上出现浮点误差。
 */
export function growthForAmountCents(amountCents: number, date: Date = new Date()): number {
  return Math.floor(Math.max(amountCents, 0) / 100) * memberDayInfo(date).rewardPerYuan;
}
