import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type EntityManager } from 'typeorm';
import { MemberCouponStatus, levelByGrowth } from '../../common/constants/dict';
import { growthForAmountCents } from '../../common/constants/member-program';
import { TenantRepo } from '../../common/repository/tenant.repo';
import { toCents } from '../../common/utils/money.util';
import { Member } from '../../database/entities/member.entity';
import { MemberCoupon } from '../../database/entities/member-coupon.entity';
import { Order } from '../../database/entities/order.entity';
import {
  GrowthTaskCode,
  GROWTH_TASK_RULES,
  taskRewardFor,
} from '../client/constants/member-benefits';

const REWARD_OF = new Map(
  GROWTH_TASK_RULES.map((rule) => [rule.code, rule.rewardGrowth] as const),
);

/**
 * 会员成长域：唯一允许改写 `member.growth_value` 与由此推导 `level` 的地方。
 *
 * 三个入口都收敛到这里，商家端与小程序端才不会出现两套成长值算法：
 * - creditOrderCompletion：订单完成，消费金额换算成长值 + 达成型任务奖励；
 * - creditCouponUsed：券核销后调用，首张用券任务达成时补发；
 * - creditProfileCompleted：顾客自己补全手机号时发一次，不会重复发。
 *
 * 订单完成时的金额直接取自订单落库的 payAmount（后端算价结果），
 * 成长值因此和实付严格一致——退款不再累加，已完成订单也不会因改价而漂移。
 */
@Injectable()
export class MemberGrowthService {
  private readonly logger = new Logger(MemberGrowthService.name);
  private readonly members: TenantRepo<Member>;
  private readonly coupons: TenantRepo<MemberCoupon>;

  constructor(
    @InjectRepository(Member) private readonly memberRepository: Repository<Member>,
    @InjectRepository(MemberCoupon) couponRepository: Repository<MemberCoupon>,
  ) {
    this.members = new TenantRepo(memberRepository);
    this.coupons = new TenantRepo(couponRepository);
  }

  /**
   * 订单完成那一刻结算成长值。
   *
   * manager 必传：调用方（商家端订单状态机）是在一个事务里改完 orderCount 再调这里的，
   * 如果本服务用它自己的池连接去 UPDATE 同一行 member，两个连接会抢同一把行锁，
   * 表现是接口挂 50 秒后抛 Lock wait timeout。写操作必须留在调用方的事务内。
   */
  async creditOrderCompletion(
    order: Order,
    member: Member,
    manager: EntityManager,
  ): Promise<number> {
    if (order.memberId === null || member.merchantId !== order.merchantId) {
      return 0;
    }
    const spending = growthForAmountCents(toCents(order.payAmount), order.completedAt ?? new Date());
    const taskReward = taskRewardFor(member.orderCount, 0, false);
    return this.applyGrowth(member, spending + taskReward, '订单完成', manager);
  }

  async creditCouponUsed(merchantId: number, memberId: number): Promise<number> {
    const usedCount = await this.coupons.count(merchantId, {
      memberId,
      status: MemberCouponStatus.Used,
    });
    if (usedCount !== 1) {
      return 0;
    }
    const member = await this.members.findBy(merchantId, { id: memberId });
    if (!member) {
      return 0;
    }
    return this.applyGrowth(member, REWARD_OF.get(GrowthTaskCode.FirstCouponUsed) ?? 0, '首次用券');
  }

  /** 手机号从空到有才算「完善资料」，避免每次改昵称都发一次奖。 */
  async creditProfileCompleted(
    merchantId: number,
    memberId: number,
    phoneBefore: string | null,
    phoneAfter: string | null,
  ): Promise<number> {
    if (phoneBefore || !phoneAfter) {
      return 0;
    }
    const member = await this.members.findBy(merchantId, { id: memberId });
    if (!member) {
      return 0;
    }
    return this.applyGrowth(member, REWARD_OF.get(GrowthTaskCode.BindPhone) ?? 0, '完善资料');
  }

  /**
   * 首单 / 累计 3 单这两档由订单完成路径负责，
   * 这里只负责把「正好落在目标值」的判断收在一处，供调用方自查。
   */
  static hitsOrderMilestone(orderCount: number): boolean {
    return orderCount === 1 || orderCount === 3;
  }

  private async applyGrowth(
    member: Member,
    amount: number,
    reason: string,
    manager?: EntityManager,
  ): Promise<number> {
    if (amount <= 0) {
      return 0;
    }
    const growthValue = member.growthValue + amount;
    const level = levelByGrowth(growthValue).level;
    member.growthValue = growthValue;
    member.level = level;
    const repository = manager ? manager.getRepository(Member) : this.memberRepository;
    await repository.save(member);
    this.logger.log(`会员 ${member.id} ${reason}获得 ${amount} 成长值（累计 ${growthValue}，等级 ${level}）`);
    return amount;
  }
}
