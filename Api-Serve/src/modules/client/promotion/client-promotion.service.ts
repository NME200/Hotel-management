import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import {
  CouponScopeType,
  PromotionStatus,
  PromotionType,
} from '../../../common/constants/dict';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { toCents } from '../../../common/utils/money.util';
import { Dish } from '../../../database/entities/dish.entity';
import { Promotion } from '../../../database/entities/promotion.entity';

/** 一行菜能享受到的活动优惠：立减多少分、角标写什么。 */
export interface PromotionHit {
  promotionId: number;
  badge: string;
  deltaCents: number;
}

/** 算价只需要这几列，写成 Pick 是为了让菜单和结算传同一种对象。 */
export type PromotableDish = Pick<Dish, 'id' | 'categoryId' | 'price'>;

/** 角标兜底字：商家没填 badge 时顾客端看到的默认标。 */
export const DEFAULT_PROMOTION_BADGE = '活动';

/**
 * 限时活动的匹配与算立减。
 *
 * 一个菜品同时命中多条活动时取「立减最多」的那条，与会员价的关系也同样是取低，
 * 两条规则合成一句：顾客永远看到当下最划算的价格，商家不会配出互相打架的活动。
 */
@Injectable()
export class ClientPromotionService {
  private readonly promotions: TenantRepo<Promotion>;

  constructor(@InjectRepository(Promotion) repository: Repository<Promotion>) {
    this.promotions = new TenantRepo(repository);
  }

  /** 当前时刻生效的活动。时间窗判断只在这里做一次，调用方拿到的是可直接用的集合。 */
  async activeOf(merchantId: number, now: Date = new Date()): Promise<Promotion[]> {
    const rows = await this.promotions.list(merchantId, {
      where: { status: PromotionStatus.Enabled },
      order: { id: 'ASC' },
    });
    return rows.filter((row) => inWindow(row, now));
  }

  /**
   * 最优活动。
   *
   * lineBaseCents 传这一行的真实基础价（含规格差价）：折扣型要按它算，
   * 活动价型仍然按菜品基础价换算成立减额——与 dish.memberPrice 的口径保持一致，
   * 否则选了大份会凭空多打一次折。
   */
  bestFor(
    promotions: Promotion[],
    dish: PromotableDish,
    lineBaseCents: number,
  ): PromotionHit | null {
    let best: PromotionHit | null = null;
    for (const promotion of promotions) {
      if (!covers(promotion, dish)) {
        continue;
      }
      const deltaCents = deltaOf(promotion, dish, lineBaseCents);
      if (deltaCents === null) {
        continue;
      }
      if (best === null || deltaCents > best.deltaCents) {
        best = {
          promotionId: promotion.id,
          badge: promotion.badge || DEFAULT_PROMOTION_BADGE,
          deltaCents,
        };
      }
    }
    return best;
  }
}

function inWindow(promotion: Promotion, now: Date): boolean {
  if (promotion.startsAt && promotion.startsAt.getTime() > now.getTime()) {
    return false;
  }
  return !promotion.endsAt || promotion.endsAt.getTime() >= now.getTime();
}

/** 范围匹配：all 全覆盖，其余按 scope_ids 里的菜品或分类 ID。 */
function covers(promotion: Promotion, dish: PromotableDish): boolean {
  if (promotion.scopeType === CouponScopeType.All || !promotion.scopeIds?.length) {
    return true;
  }
  const ids = new Set(promotion.scopeIds);
  return promotion.scopeType === CouponScopeType.Dish
    ? ids.has(dish.id)
    : ids.has(dish.categoryId);
}

/**
 * 立减额（分）。返回 null 表示这条活动对该菜没有实际优惠——
 * 活动价不低于原价、折扣比例配成 1 之类，都按「不参与」处理，
 * 不能让顾客端出现「有活动标但价格没变」。
 */
function deltaOf(
  promotion: Promotion,
  dish: PromotableDish,
  lineBaseCents: number,
): number | null {
  const baseCents = toCents(dish.price);

  if (promotion.type === PromotionType.Price) {
    if (promotion.priceCents === null) {
      return null;
    }
    const delta = baseCents - promotion.priceCents;
    return delta > 0 ? Math.min(delta, lineBaseCents) : null;
  }

  if (promotion.discountRatio === null) {
    return null;
  }
  const ratio = Number(promotion.discountRatio);
  /**
   * 折扣用整数运算：比例存的是 4 位小数（0.6000），换算成万分比后
   * 乘法全程是整数，避免 `1 - 0.8` 或 `46 * 0.6` 这类二进制浮点把价格抖掉一分钱。
   */
  const scaled = Math.round(ratio * 10000);
  if (scaled >= 10000) {
    return null;
  }
  const paid = Math.floor((lineBaseCents * scaled) / 10000);
  const delta = lineBaseCents - paid;
  return delta > 0 ? Math.min(delta, lineBaseCents) : null;
}
