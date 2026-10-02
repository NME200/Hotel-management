import type { Gender, MemberLevel } from '../../../common/constants/dict';
import type { MemberDayInfo } from '../../../common/constants/member-program';

export type { MemberDayInfo };

/** 等级进度：remaining 为还差多少成长值，最高档时为 null。 */
export interface MemberLevelProgress {
  level: MemberLevel;
  label: string;
  threshold: number;
  remaining: number;
}

export interface ClientMemberBrief {
  id: number;
  nickname: string;
  avatar: string | null;
  gender: Gender;
  phone: string | null;
  /** 脱敏手机号，个人中心展示用；未绑定为 null */
  phoneMasked: string | null;
  level: MemberLevel;
  levelLabel: string;
  growthValue: number;
  points: number;
  balance: number;
  orderCount: number;
  totalAmount: number;
  /** 未使用券张数，「我的」页三项数据之一 */
  unusedCouponCount: number;
  nextLevel: MemberLevelProgress | null;
  /** 成长值进度 0~1，最高档恒为 1 */
  levelProgress: number;
}

export interface MemberBenefit {
  code: string;
  name: string;
  /** 前端图标名，取值见常量表，避免把图标语义写死在小程序里 */
  icon: string;
  desc: string;
}

/**
 * 成长任务：奖励在达成的那一刻由后端累加进 growth_value，
 * 因此这里只报进度，不提供「点击领取」这种会重复发奖的写法。
 */
export interface GrowthTask {
  code: string;
  name: string;
  desc: string;
  icon: string;
  rewardGrowth: number;
  target: number;
  current: number;
  done: boolean;
  /** 前端跳转动作：profile / menu / coupon 等 */
  action: string;
}

export interface ClientMemberCenter {
  member: ClientMemberBrief;
  benefits: MemberBenefit[];
  tasks: GrowthTask[];
  memberDay: MemberDayInfo;
}
