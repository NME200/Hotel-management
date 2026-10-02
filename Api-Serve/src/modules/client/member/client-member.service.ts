import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MemberCouponStatus,
  levelByGrowth,
  nextLevelOf,
} from '../../../common/constants/dict';
import { memberDayInfo } from '../../../common/constants/member-program';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { maskPhone } from '../../../common/utils/mask.util';
import { Member } from '../../../database/entities/member.entity';
import { MemberCoupon } from '../../../database/entities/member-coupon.entity';
import { MemberGrowthService } from '../../member-growth/member-growth.service';
import { unusedWhere } from '../coupon/coupon.query';
import {
  MEMBER_BENEFITS,
  buildGrowthTasks,
} from '../constants/member-benefits';
import type { UpdateClientProfileDto } from '../dto/client-auth.dto';
import type {
  ClientMemberBrief,
  ClientMemberCenter,
  MemberLevelProgress,
} from '../models/client-member.model';

/**
 * 顾客端的「我是谁」：个人中心三项数据与会员中心页一整套视图都从这里出。
 *
 * 等级不人工维护：只要 growth_value 变化，读出来的 levelLabel / nextLevel /
 * 进度就跟着变，前端不需要也不允许自己判断档位。
 */
@Injectable()
export class ClientMemberService {
  private readonly members: TenantRepo<Member>;
  private readonly coupons: TenantRepo<MemberCoupon>;

  constructor(
    @InjectRepository(Member) private readonly memberRepository: Repository<Member>,
    @InjectRepository(MemberCoupon) couponRepository: Repository<MemberCoupon>,
    private readonly growth: MemberGrowthService,
  ) {
    this.members = new TenantRepo(memberRepository);
    this.coupons = new TenantRepo(couponRepository);
  }

  /** 刷新令牌时只有会员 ID（租户键在会员行上），这里按主键取一次。 */
  async requireMember(memberId: number): Promise<Member> {
    const member = await this.memberRepository.findOne({ where: { id: memberId } });
    if (!member) {
      throw BusinessException.notFound('会员不存在或已删除');
    }
    return member;
  }

  async brief(merchantId: number, memberId: number): Promise<ClientMemberBrief> {
    const member = await this.members.findById(merchantId, memberId);
    return this.toBrief(member, await this.couponCounts(merchantId, memberId));
  }

  async center(merchantId: number, memberId: number): Promise<ClientMemberCenter> {
    const member = await this.members.findById(merchantId, memberId);
    const counts = await this.couponCounts(merchantId, memberId);
    const brief = this.toBrief(member, counts);
    return {
      member: brief,
      // 权益跟着卡片上那一档走，不能各读各的：否则会出现「钻石会员」配绿卡权益
      benefits: [...MEMBER_BENEFITS[brief.level]],
      tasks: buildGrowthTasks(member.orderCount, counts.used, Boolean(member.phone)),
      memberDay: memberDayInfo(),
    };
  }

  async updateProfile(
    merchantId: number,
    memberId: number,
    dto: UpdateClientProfileDto,
  ): Promise<ClientMemberBrief> {
    const before = await this.members.findById(merchantId, memberId);
    const phone = dto.phone?.trim() || null;

    // 手机号是会员与门店之间的锚点（券、储值都挂在手机号上），一旦绑定就不允许自助改
    if (before.phone && phone && before.phone !== phone) {
      throw BusinessException.badRequest('手机号已绑定，如需更换请联系门店');
    }

    const saved = await this.members.update(merchantId, memberId, {
      ...(dto.nickname?.trim() ? { nickname: dto.nickname.trim() } : {}),
      ...(dto.avatar?.trim() ? { avatar: dto.avatar.trim() } : {}),
      ...(dto.gender ? { gender: dto.gender } : {}),
      ...(phone ? { phone } : {}),
    });

    await this.growth.creditProfileCompleted(merchantId, memberId, before.phone, saved.phone);
    return this.brief(merchantId, memberId);
  }

  /** 券的三档计数：登录响应、个人中心角标、券列表页头部都用这一份口径。 */
  async couponCounts(
    merchantId: number,
    memberId: number,
  ): Promise<{ unused: number; used: number }> {
    const [unused, used] = await Promise.all([
      this.coupons.count(merchantId, unusedWhere(memberId, new Date())),
      this.coupons.count(merchantId, { memberId, status: MemberCouponStatus.Used }),
    ]);
    return { unused, used };
  }

  /** 会员档案装配。冷启动恢复会话时已经有会员实体，直接复用这里避免重复查库。 */
  toBrief(member: Member, counts: { unused: number; used: number }): ClientMemberBrief {
    const rule = levelByGrowth(member.growthValue);
    const next = nextLevelOf(rule.level);
    const nextLevel: MemberLevelProgress | null = next
      ? {
          level: next.level,
          label: next.label,
          threshold: next.threshold,
          remaining: Math.max(next.threshold - member.growthValue, 0),
        }
      : null;

    return {
      id: member.id,
      nickname: member.nickname,
      avatar: member.avatar,
      gender: member.gender,
      phone: member.phone,
      phoneMasked: maskPhone(member.phone),
      level: rule.level,
      // 等级一律由成长值反推：member.level 只是发奖时同步的冗余列，
      // 一旦历史数据和阈值表对不上，卡片就会出现「钻石会员 / 还需 510 升银卡」这种自相矛盾。
      levelLabel: rule.label,
      growthValue: member.growthValue,
      points: member.points,
      balance: member.balance,
      orderCount: member.orderCount,
      totalAmount: member.totalAmount,
      unusedCouponCount: counts.unused,
      nextLevel,
      levelProgress: progressRatio(member.growthValue, rule.threshold, next?.threshold ?? null),
    };
  }
}

/** 当前档位内的进度 0~1：会员中心的进度条两端档位值由 nextLevel 给出。 */
function progressRatio(growthValue: number, from: number, to: number | null): number {
  if (to === null || to <= from) {
    return 1;
  }
  return Math.min(Math.max((growthValue - from) / (to - from), 0), 1);
}
