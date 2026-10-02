import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  LessThan,
  MoreThanOrEqual,
  Repository,
  type EntityManager,
  type FindOptionsWhere,
} from 'typeorm';
import {
  CouponScopeType,
  CouponSource,
  CouponStatus,
  CouponType,
  CouponValidityType,
  MemberCouponStatus,
} from '../../../common/constants/dict';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { formatDateKey } from '../../../common/utils/date.util';
import { generateCouponNo } from '../../../common/utils/id.util';
import { toCents, toYuan } from '../../../common/utils/money.util';
import { CouponTemplate } from '../../../database/entities/coupon-template.entity';
import { MemberCoupon } from '../../../database/entities/member-coupon.entity';
import { couponWhereByStatus, unusedWhere } from './coupon.query';
import type {
  ClaimableCouponView,
  ClientCouponView,
  CouponLineInput,
  UsableCouponView,
} from '../models/client-coupon.model';

/** 一次算券的结果：分成「能不能用」和「用得上多少钱」两件事，提示语才不至于含糊。 */
interface CouponEvaluation {
  usable: boolean;
  discountCents: number;
  /** 适用范围内的小计（分），门槛也按这个金额判断 */
  eligibleCents: number;
  reason: string | null;
}

/**
 * 优惠券：领取、兑换、结算页选券、下单核销。
 *
 * 三条硬规则：
 * 1. 券的面额、门槛、适用范围全部用「分」与快照字段计算，不看模板当前值——
 *    商户改模板不能追溯改变已发出的券；
 * 2. 门槛按「适用范围内小计」判断，不是整单金额，混合下单时不会误判可用；
 * 3. 核销用 CAS（status=unused 才更新），并发下同一张券只会被用掉一次。
 */
@Injectable()
export class ClientCouponService {
  private readonly memberCoupons: TenantRepo<MemberCoupon>;
  private readonly templates: TenantRepo<CouponTemplate>;

  constructor(
    @InjectRepository(MemberCoupon)
    private readonly couponRepository: Repository<MemberCoupon>,
    @InjectRepository(CouponTemplate)
    private readonly templateRepository: Repository<CouponTemplate>,
  ) {
    this.memberCoupons = new TenantRepo(couponRepository);
    this.templates = new TenantRepo(templateRepository);
  }

  /* --------------------------- 我的优惠券 --------------------------- */

  async list(
    merchantId: number,
    memberId: number,
    status: MemberCouponStatus,
  ): Promise<ClientCouponView[]> {
    const rows = await this.memberCoupons.list(merchantId, {
      where: couponWhereByStatus(status, memberId, new Date()),
      order: { id: 'DESC' },
    });
    return rows.map((row) => this.toView(row));
  }

  async counts(
    merchantId: number,
    memberId: number,
  ): Promise<{ unused: number; used: number; expired: number }> {
    const now = new Date();
    const [unused, used, expired] = await Promise.all([
      this.couponRepository.count({ where: { merchantId, ...unusedWhere(memberId, now) } }),
      this.couponRepository.count({ where: { merchantId, memberId, status: MemberCouponStatus.Used } }),
      this.couponRepository.count({
        where: [
          { merchantId, memberId, status: MemberCouponStatus.Expired },
          { merchantId, memberId, status: MemberCouponStatus.Unused, validTo: LessThan(now) },
        ],
      }),
    ]);
    return { unused, used, expired };
  }

  /* ----------------------------- 领券中心 ----------------------------- */

  /**
   * 领券中心。
   *
   * memberId 允许为空（未登录浏览）：此时「已领过」一律按未领计算，
   * 首页 Banner 因此能在顾客登录前就展示真实可领券；真正领取仍要求登录。
   */
  async claimable(
    merchantId: number,
    memberId: number | null,
  ): Promise<ClaimableCouponView[]> {
    const rows = await this.templates.list(merchantId, {
      where: { status: CouponStatus.Enabled, claimable: true },
      order: { sort: 'ASC', id: 'DESC' },
    });
    if (rows.length === 0) {
      return [];
    }

    const claimed = memberId === null ? [] : await this.memberCoupons.list(merchantId, {
      where: { memberId, templateId: In(rows.map((row) => row.id)) },
      select: { templateId: true },
    });
    const claimedCount = new Map<number, number>();
    for (const record of claimed) {
      claimedCount.set(record.templateId, (claimedCount.get(record.templateId) ?? 0) + 1);
    }

    return rows.map((row) => {
      const owned = claimedCount.get(row.id) ?? 0;
      const remaining = row.totalCount < 0 ? -1 : Math.max(row.totalCount - row.issuedCount, 0);
      const soldOut = remaining !== -1 && remaining <= 0;
      const reachedLimit = owned >= row.perMemberLimit;
      return {
        templateId: row.id,
        name: row.name,
        type: row.type,
        faceText: faceTextOf(row.type, row.amountCents, row.discountRatio),
        thresholdText: thresholdTextOf(row.thresholdCents),
        description: row.description,
        validText: validTextOf(row, new Date()),
        scopeText: scopeTextOf(row.scopeType),
        remaining,
        claimable: !soldOut && !reachedLimit,
        claimTip: soldOut ? '已领完' : reachedLimit ? '已达领取上限' : null,
      };
    });
  }

  async claim(merchantId: number, memberId: number, templateId: number): Promise<ClientCouponView> {
    const template = await this.templates.findBy(merchantId, { id: templateId });
    if (!template || template.status !== CouponStatus.Enabled || !template.claimable) {
      throw BusinessException.notFound('该优惠券已下架');
    }
    return this.issue(merchantId, memberId, template, CouponSource.Claim);
  }

  async redeem(
    merchantId: number,
    memberId: number,
    code: string,
  ): Promise<ClientCouponView> {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      throw BusinessException.badRequest('请输入兑换码');
    }
    const template = await this.templates.findBy(merchantId, { redeemCode: normalized });
    if (!template || template.status !== CouponStatus.Enabled) {
      throw BusinessException.badRequest('兑换码无效或已失效');
    }
    return this.issue(merchantId, memberId, template, CouponSource.RedeemCode);
  }

  /* ------------------------------ 结算 ------------------------------ */

  /** 结算页券列表：带上本单可用性判断与可优惠金额，前端不必再算钱。 */
  async usableFor(
    merchantId: number,
    memberId: number,
    lines: CouponLineInput[],
  ): Promise<UsableCouponView[]> {
    const rows = await this.memberCoupons.list(merchantId, {
      where: { memberId, status: MemberCouponStatus.Unused, validFrom: LessThan(new Date()), validTo: MoreThanOrEqual(new Date()) },
      order: { id: 'DESC' },
    });
    return rows.map((row) => {
      const evaluation = evaluate(row, lines);
      return {
        ...this.toView(row),
        usable: evaluation.usable,
        discountAmount: toYuan(evaluation.discountCents),
        unusableReason: evaluation.reason,
      };
    });
  }

  /**
   * 结算页/下单页共用：把选中的券算成一个确定的优惠金额。
   * 选中的券必须属于本人且未使用，否则直接报错而不是悄悄按 0 优惠下单。
   */
  async assertDiscount(
    merchantId: number,
    memberId: number,
    couponId: number,
    lines: CouponLineInput[],
  ): Promise<{ coupon: MemberCoupon; discountCents: number }> {
    const coupon = await this.memberCoupons.findBy(merchantId, { id: couponId, memberId });
    if (!coupon) {
      throw BusinessException.badRequest('所选优惠券不属于当前账号');
    }
    const evaluation = evaluate(coupon, lines);
    if (!evaluation.usable) {
      throw BusinessException.badRequest(evaluation.reason ?? '该优惠券本单不可用');
    }
    return { coupon, discountCents: evaluation.discountCents };
  }

  /**
   * 核销：条件更新保证同一张券只能被一单用掉。
   * 返回 false 时调用方必须回滚整单——那说明这张券已被另一笔并发订单占用。
   */
  async markUsed(
    manager: EntityManager,
    merchantId: number,
    couponId: number,
    memberId: number,
    orderId: number,
  ): Promise<boolean> {
    const result = await manager.getRepository(MemberCoupon).update(
      {
        id: couponId,
        merchantId,
        memberId,
        status: MemberCouponStatus.Unused,
        validTo: MoreThanOrEqual(new Date()),
      },
      { status: MemberCouponStatus.Used, orderId, usedAt: new Date() },
    );
    return (result.affected ?? 0) > 0;
  }

  /** 订单取消时把这单用掉的券放回顾客口袋，否则一次取消就吞掉一张券。 */
  async releaseByOrder(
    manager: EntityManager,
    merchantId: number,
    orderId: number,
  ): Promise<void> {
    await manager.getRepository(MemberCoupon).update(
      { merchantId, orderId, status: MemberCouponStatus.Used },
      { status: MemberCouponStatus.Unused, orderId: null, usedAt: null },
    );
  }

  /* ------------------------------ 内部 ------------------------------ */

  /**
   * 发票：库存与限领都靠「按旧值 CAS 更新 issued_count」保证不超发。
   * 这里不用事务包整段，是因为唯一约束与条件更新已经足够把并发收敛成一次成功。
   */
  private async issue(
    merchantId: number,
    memberId: number,
    template: CouponTemplate,
    source: CouponSource,
  ): Promise<ClientCouponView> {
    const owned = await this.couponRepository.count({
      where: { merchantId, memberId, templateId: template.id },
    });
    if (owned >= template.perMemberLimit) {
      throw BusinessException.badRequest(`该券每人限领 ${template.perMemberLimit} 张`);
    }

    const claimed = await this.reserveStock(template);
    if (!claimed) {
      throw BusinessException.conflict('该优惠券已被领完');
    }

    const validity = validityOf(template, new Date());
    try {
      const coupon = await this.memberCoupons.create(merchantId, {
        couponNo: generateCouponNo(),
        templateId: template.id,
        memberId,
        ...snapshotOf(template),
        ...validity,
        status: MemberCouponStatus.Unused,
        source,
      });
      return this.toView(coupon);
    } catch (error) {
      // 发票失败要把刚占掉的库存还回去，否则券会越堆越少
      await this.rollbackStock(template);
      throw error;
    }
  }

  /** issued_count 按「读到的旧值」做条件自增，两个请求同时领最后一张时只有一个能成。 */
  private async reserveStock(template: CouponTemplate): Promise<boolean> {
    if (template.totalCount < 0) {
      return true;
    }
    if (template.issuedCount >= template.totalCount) {
      return false;
    }
    const result = await this.templateRepository.update(
      { id: template.id, issuedCount: template.issuedCount, status: CouponStatus.Enabled },
      { issuedCount: template.issuedCount + 1 },
    );
    return (result.affected ?? 0) > 0;
  }

  private async rollbackStock(template: CouponTemplate): Promise<void> {
    if (template.totalCount < 0) {
      return;
    }
    await this.templateRepository.update(
      { id: template.id, issuedCount: template.issuedCount + 1 },
      { issuedCount: template.issuedCount },
    );
  }

  private toView(coupon: MemberCoupon): ClientCouponView {
    const now = new Date();
    const expired =
      coupon.status === MemberCouponStatus.Expired ||
      (coupon.status === MemberCouponStatus.Unused && coupon.validTo.getTime() < now.getTime());
    return {
      id: coupon.id,
      couponNo: coupon.couponNo,
      name: coupon.name,
      type: coupon.type,
      amount: coupon.type === CouponType.Reduction ? toYuan(coupon.amountCents) : null,
      discount: coupon.discountRatio === null ? null : toDiscountText(coupon.discountRatio),
      faceText: faceTextOf(coupon.type, coupon.amountCents, coupon.discountRatio),
      threshold: toYuan(coupon.thresholdCents),
      thresholdText: thresholdTextOf(coupon.thresholdCents),
      description: describeScope(coupon),
      validFrom: coupon.validFrom,
      validTo: coupon.validTo,
      validText: `${formatDateKey(coupon.validFrom)} ~ ${formatDateKey(coupon.validTo)}`,
      status: expired ? MemberCouponStatus.Expired : coupon.status,
      source: coupon.source as CouponSource,
      scopeText: scopeTextOf(coupon.scopeType),
      usedAt: coupon.usedAt,
      orderId: coupon.orderId,
    };
  }
}

/* ============================ 纯函数：算券与文案 ============================ */

/** 范围内小计：all 取全部行，category/dish 按快照里的 ID 过滤。 */
function eligibleCentsOf(
  coupon: Pick<MemberCoupon, 'scopeType' | 'scopeIds'>,
  lines: CouponLineInput[],
): number {
  if (coupon.scopeType === CouponScopeType.All || !coupon.scopeIds?.length) {
    return lines.reduce((sum, line) => sum + line.totalCents, 0);
  }
  const ids = new Set(coupon.scopeIds);
  const matched =
    coupon.scopeType === CouponScopeType.Dish
      ? lines.filter((line) => ids.has(line.dishId))
      : lines.filter((line) => ids.has(line.categoryId));
  return matched.reduce((sum, line) => sum + line.totalCents, 0);
}

/**
 * 算优惠：满减取「面额与范围内小计的较小值」，折扣按实付比例取整并受封顶约束。
 * 全程整数分，向下取整——多收一分都比顾客投诉便宜。
 */
export function evaluate(
  coupon: Pick<
    MemberCoupon,
    'type' | 'amountCents' | 'discountRatio' | 'maxDiscountCents' | 'thresholdCents' | 'scopeType' | 'scopeIds' | 'validFrom' | 'validTo' | 'status'
  >,
  lines: CouponLineInput[],
  now: Date = new Date(),
): CouponEvaluation {
  const eligibleCents = eligibleCentsOf(coupon, lines);
  const base = { usable: false, discountCents: 0, eligibleCents };

  if (coupon.status !== MemberCouponStatus.Unused) {
    return { ...base, reason: '该优惠券已使用或已失效' };
  }
  if (coupon.validFrom.getTime() > now.getTime()) {
    return { ...base, reason: `该券 ${formatDateKey(coupon.validFrom)} 起可用` };
  }
  if (coupon.validTo.getTime() < now.getTime()) {
    return { ...base, reason: '该优惠券已过期' };
  }
  if (eligibleCents <= 0) {
    return { ...base, reason: scopeReason(coupon.scopeType) };
  }
  if (eligibleCents < coupon.thresholdCents) {
    return {
      ...base,
      reason: `满 ${toYuan(coupon.thresholdCents)} 元可用，本单适用菜品还差 ${toYuan(coupon.thresholdCents - eligibleCents)} 元`,
    };
  }

  const discountCents =
    coupon.type === CouponType.Discount
      ? discountOf(coupon, eligibleCents)
      : Math.min(coupon.amountCents, eligibleCents);

  if (discountCents <= 0) {
    return { ...base, reason: '该优惠券本单无可优惠金额' };
  }
  return { usable: true, discountCents, eligibleCents, reason: null };
}

function discountOf(
  coupon: Pick<MemberCoupon, 'discountRatio' | 'maxDiscountCents'>,
  eligibleCents: number,
): number {
  const ratio = coupon.discountRatio ?? 1;
  if (ratio <= 0 || ratio >= 1) {
    return 0;
  }
  const raw = Math.floor(eligibleCents * (1 - ratio));
  const capped = coupon.maxDiscountCents === null ? raw : Math.min(raw, coupon.maxDiscountCents);
  return Math.min(capped, eligibleCents);
}

function scopeReason(scopeType: CouponScopeType): string {
  if (scopeType === CouponScopeType.Dish) {
    return '本单没有该券适用的菜品';
  }
  if (scopeType === CouponScopeType.Category) {
    return '本单没有该券适用分类的菜品';
  }
  return '本单无可优惠金额';
}

function describeScope(coupon: MemberCoupon): string {
  if (coupon.description) {
    return coupon.description;
  }
  return scopeTextOf(coupon.scopeType);
}

function snapshotOf(template: CouponTemplate) {
  return {
    name: template.name,
    type: template.type,
    amountCents: template.amountCents,
    discountRatio: template.discountRatio,
    maxDiscountCents: template.maxDiscountCents,
    thresholdCents: template.thresholdCents,
    scopeType: template.scopeType,
    scopeIds: template.scopeIds,
    description: template.description,
  };
}

function validityOf(template: CouponTemplate, now: Date) {
  if (template.validityType === CouponValidityType.Relative) {
    const days = template.validDays && template.validDays > 0 ? template.validDays : 30;
    const validTo = new Date(now.getTime());
    validTo.setDate(validTo.getDate() + days);
    // 领取型券统一给到当天 23:59:59，避免「差几分钟到期」这种说不清的边界
    validTo.setHours(23, 59, 59, 0);
    return { validFrom: now, validTo };
  }
  return {
    validFrom: template.validFrom ?? now,
    validTo: template.validTo ?? now,
  };
}

function faceTextOf(type: CouponType, amountCents: number, ratio: number | null): string {
  if (type === CouponType.Discount && ratio !== null) {
    return `${toDiscountText(ratio)}折`;
  }
  return `¥${trimAmount(toYuan(amountCents))}`;
}

function thresholdTextOf(thresholdCents: number): string {
  return thresholdCents > 0 ? `满 ${trimAmount(toYuan(thresholdCents))} 元可用` : '无门槛';
}

/** 模板的有效期文案：固定区间直说日期，领取型的说「领取后 N 天」。 */
function validTextOf(template: CouponTemplate, now: Date): string {
  if (template.validityType === CouponValidityType.Relative) {
    return `领取后 ${template.validDays ?? 30} 天内有效`;
  }
  const { validFrom, validTo } = validityOf(template, now);
  return `${formatDateKey(validFrom)} ~ ${formatDateKey(validTo)}`;
}

function scopeTextOf(scopeType: CouponScopeType): string {
  if (scopeType === CouponScopeType.Dish) {
    return '限指定菜品';
  }
  if (scopeType === CouponScopeType.Category) {
    return '限指定分类';
  }
  return '全场通用';
}

/** 0.8800 -> 8.8；0.9000 -> 9；折扣展示去掉尾部的 0。 */
function toDiscountText(ratio: number): number {
  const tenths = Math.round(ratio * 100) / 10;
  return Number.isInteger(tenths) ? tenths : Number(tenths.toFixed(1));
}

function trimAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '');
}
