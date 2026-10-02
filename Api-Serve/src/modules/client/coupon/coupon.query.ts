import { LessThan, MoreThanOrEqual } from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';
import { MemberCouponStatus } from '../../../common/constants/dict';
import { MemberCoupon } from '../../../database/entities/member-coupon.entity';

/**
 * 券状态的查询口径。
 *
 * 「过期」在库里不是一个即时事件：没人会在零点把每行 status 改掉。
 * 因此三张筛选标签一律按 status + valid_to 组合判断，
 * 计数与列表用同一组条件，避免出现「列表里没有但角标算它未使用」的偏差。
 */
export function unusedWhere(memberId: number, now: Date): FindOptionsWhere<MemberCoupon> {
  return {
    memberId,
    status: MemberCouponStatus.Unused,
    validFrom: LessThan(now),
    validTo: MoreThanOrEqual(now),
  };
}

export function usedWhere(memberId: number): FindOptionsWhere<MemberCoupon> {
  return { memberId, status: MemberCouponStatus.Used };
}

export function expiredWhere(memberId: number, now: Date): FindOptionsWhere<MemberCoupon>[] {
  return [
    { memberId, status: MemberCouponStatus.Expired },
    // 未使用但已过有效期：库里状态还是 unused，展示口径要归到已过期
    {
      memberId,
      status: MemberCouponStatus.Unused,
      validTo: LessThan(now),
    },
  ];
}

export function couponWhereByStatus(
  status: MemberCouponStatus,
  memberId: number,
  now: Date,
): FindOptionsWhere<MemberCoupon> | FindOptionsWhere<MemberCoupon>[] {
  if (status === MemberCouponStatus.Unused) {
    return unusedWhere(memberId, now);
  }
  if (status === MemberCouponStatus.Expired) {
    return expiredWhere(memberId, now);
  }
  return usedWhere(memberId);
}
