import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  DineType,
  DishStatus,
  OptionGroupType,
  StockType,
} from '../../../common/constants/dict';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { toCents } from '../../../common/utils/money.util';
import { Dish } from '../../../database/entities/dish.entity';
import { DishOptionGroup } from '../../../database/entities/dish-option-group.entity';
import { DishSku } from '../../../database/entities/dish-sku.entity';
import { Member } from '../../../database/entities/member.entity';
import { MemberCoupon } from '../../../database/entities/member-coupon.entity';
import { ClientCouponService } from '../coupon/client-coupon.service';
import { ClientPromotionService } from '../promotion/client-promotion.service';
import {
  DELIVERY_CENTS,
  PACKING_CENTS_PER_LINE,
} from '../constants/client.constant';
import type { ClientOrderItemDto } from '../dto/client-order.dto';
import type { CouponLineInput } from '../models/client-coupon.model';

export interface PricedLine {
  dishId: number;
  categoryId: number;
  dishName: string;
  dishImage: string | null;
  skuId: number | null;
  /** 规格与加料的完整描述，落在订单明细上，商家端出单直接打印 */
  specDesc: string;
  unitPriceCents: number;
  quantity: number;
  totalCents: number;
  /** 该行是否按会员价计算，结算页据此标出「已享会员价」 */
  memberPriced: boolean;
  /** 该行是否按活动价计算：与会员价取低，只有一方会生效 */
  promotionPriced: boolean;
  /** 生效那条活动的角标，没生效时为 null */
  promotionBadge: string | null;
}

/**
 * 库存扣减计划：键是编码后的「菜品 ID」或「规格 ID」（见 dishStockKey/skuStockKey），
 * 值是这一单要扣掉的份数。算价阶段只累计不下手，真正扣减由下单服务在同一事务里做，
 * 这样算价本身可以安全地被结算页反复预览调用。
 */
export type StockPlan = Map<number, number>;

export interface PricedOrder {
  lines: PricedLine[];
  dishAmountCents: number;
  packingAmountCents: number;
  deliveryAmountCents: number;
  discountCents: number;
  payAmountCents: number;
  coupon: MemberCoupon | null;
  stockPlan: StockPlan;
}

/**
 * 顾客侧算价：结算页预览与提交订单走同一个方法，保证「看到的价格」就是「落库的价格」。
 *
 * 全链路用「分」计算，只在最后交给订单实体时转回元——与支付域同一口径，
 * 避免加料差价 × 数量凑出 0.01 的误差。
 *
 * 四条口径值得说明：
 * 1. 会员价按「菜品基础价与会员价的差额」立减，选了大份也减同一额度；
 * 2. 活动价与会员价**取低**，同一行只按更便宜的一方成交，不叠两次优惠；
 * 3. 打包费按份收（一份一个餐盒），外送另收固定配送费，堂食两者为 0；
 * 4. 优惠券的门槛与抵扣都只作用于菜品金额，不抵打包费与配送费，
 *    且抵扣基数是取低之后的实价。
 */
@Injectable()
export class ClientOrderPriceService {
  private readonly dishes: TenantRepo<Dish>;
  private readonly members: TenantRepo<Member>;

  constructor(
    @InjectRepository(Dish) dishRepository: Repository<Dish>,
    @InjectRepository(Member) memberRepository: Repository<Member>,
    private readonly dataSource: DataSource,
    private readonly coupons: ClientCouponService,
    private readonly promotions: ClientPromotionService,
  ) {
    this.dishes = new TenantRepo(dishRepository);
    this.members = new TenantRepo(memberRepository);
  }

  async price(
    merchantId: number,
    memberId: number,
    dineType: DineType,
    items: ClientOrderItemDto[],
    couponId?: number,
  ): Promise<PricedOrder> {
    const merged = mergeLines(items);
    if (merged.length === 0) {
      throw BusinessException.badRequest('请先选择菜品');
    }

    const dishIds = [...new Set(merged.map((line) => line.dishId))];
    const [dishRows, skus, optionGroups, member, promotions] = await Promise.all([
      this.dishes.list(merchantId, { where: { id: In(dishIds) } }),
      this.dataSource.getRepository(DishSku).find({ where: { merchantId, dishId: In(dishIds) } }),
      this.dataSource
        .getRepository(DishOptionGroup)
        .find({ where: { merchantId, dishId: In(dishIds) } }),
      this.members.findById(merchantId, memberId),
      this.promotions.activeOf(merchantId),
    ]);

    const dishById = new Map(dishRows.map((dish) => [dish.id, dish] as const));
    const skuById = new Map(skus.map((sku) => [sku.id, sku] as const));
    const groupById = new Map(optionGroups.map((group) => [group.id, group] as const));
    const stockPlan: StockPlan = new Map();
    const lines: PricedLine[] = [];

    for (const line of merged) {
      const dish = dishById.get(line.dishId);
      if (!dish) {
        throw BusinessException.badRequest('购物车里有菜品已被下架，请刷新菜单');
      }
      if (dish.status !== DishStatus.OnSale) {
        throw BusinessException.badRequest(`「${dish.name}」已下架，请从购物车移除`);
      }

      const sku = this.resolveSku(dish, line, skuById);
      const { optionText, optionCents } = this.resolveOptions(dish, line, groupById);
      const base = toCents(sku ? sku.price : dish.price);
      const memberDiscount = this.memberCents(dish, member);
      const promotion = this.promotions.bestFor(promotions, dish, base);
      // 活动价与会员价取低：两个优惠都真实存在，但同一行只按更便宜的那个成交
      const memberDelta = memberDiscount ?? 0;
      const promotionDelta = promotion?.deltaCents ?? 0;
      const promotionPriced = promotionDelta > memberDelta;
      const bestDelta = Math.max(memberDelta, promotionDelta);

      this.reserveStock(dish, sku, line.quantity, stockPlan);

      const unitPriceCents = Math.max(base - bestDelta, 0) + optionCents;
      lines.push({
        dishId: dish.id,
        categoryId: dish.categoryId,
        dishName: dish.name,
        dishImage: dish.image,
        skuId: sku?.id ?? null,
        specDesc: [sku?.name, optionText].filter(Boolean).join(' / '),
        unitPriceCents,
        quantity: line.quantity,
        totalCents: unitPriceCents * line.quantity,
        memberPriced: memberDelta > 0 && !promotionPriced,
        promotionPriced,
        promotionBadge: promotionPriced ? promotion!.badge : null,
      });
    }

    const dishAmountCents = sum(lines.map((line) => line.totalCents));
    const portions = sum(lines.map((line) => line.quantity));
    const packingAmountCents =
      dineType === DineType.DineIn ? 0 : portions * PACKING_CENTS_PER_LINE;
    const deliveryAmountCents = dineType === DineType.Takeout ? DELIVERY_CENTS : 0;

    let discountCents = 0;
    let coupon: MemberCoupon | null = null;
    if (couponId) {
      const couponLines: CouponLineInput[] = lines.map((line) => ({
        dishId: line.dishId,
        categoryId: line.categoryId,
        totalCents: line.totalCents,
      }));
      const settled = await this.coupons.assertDiscount(
        merchantId,
        memberId,
        couponId,
        couponLines,
      );
      coupon = settled.coupon;
      // 优惠只抵菜品金额，抵完不为负；打包费与配送费不参与
      discountCents = Math.min(settled.discountCents, dishAmountCents);
    }

    const payAmountCents = Math.max(
      dishAmountCents + packingAmountCents + deliveryAmountCents - discountCents,
      0,
    );

    return {
      lines,
      dishAmountCents,
      packingAmountCents,
      deliveryAmountCents,
      discountCents,
      payAmountCents,
      coupon,
      stockPlan,
    };
  }

  private resolveSku(
    dish: Dish,
    line: { skuId?: number; quantity: number },
    skuById: Map<number, DishSku>,
  ): DishSku | null {
    if (!line.skuId) {
      return null;
    }
    const sku = skuById.get(line.skuId);
    if (!sku || sku.dishId !== dish.id) {
      throw BusinessException.badRequest(`「${dish.name}」的规格已变更，请重新选择`);
    }
    return sku;
  }

  /**
   * 加料与口味校验：分组必须属于该菜品、单选组只能选一项、必选组不能不选、
   * 选项名必须真实存在。任何一条不过都是 400，而不是悄悄忽略多出来的差价。
   */
  private resolveOptions(
    dish: Dish,
    line: { optionSelections?: { groupId: number; optionNames: string[] }[] },
    groupById: Map<number, DishOptionGroup>,
  ): { optionText: string; optionCents: number } {
    const selections = line.optionSelections ?? [];
    const byGroup = new Map<number, string[]>();
    for (const selection of selections) {
      const names = byGroup.get(selection.groupId) ?? [];
      names.push(...selection.optionNames.map((name) => name.trim()).filter(Boolean));
      byGroup.set(selection.groupId, names);
    }

    let optionCents = 0;
    const texts: string[] = [];
    const touched = new Set<number>();

    for (const [groupId, names] of byGroup) {
      const group = groupById.get(groupId);
      if (!group || group.dishId !== dish.id) {
        throw BusinessException.badRequest(`「${dish.name}」的加料选项已变更，请重新选择`);
      }
      touched.add(groupId);
      if (group.type === OptionGroupType.Single && names.length > 1) {
        throw BusinessException.badRequest(`「${group.name}」只能选一项`);
      }
      for (const name of names) {
        const option = group.options?.find((item) => item.name === name);
        if (!option) {
          throw BusinessException.badRequest(`「${dish.name}」没有「${name}」这个选项`);
        }
        optionCents += toCents(option.priceDelta);
        texts.push(option.priceDelta > 0 ? `${name} +¥${option.priceDelta}` : name);
      }
    }

    for (const group of groupById.values()) {
      if (group.dishId === dish.id && group.required && !touched.has(group.id)) {
        throw BusinessException.badRequest(`请选择${group.name}`);
      }
    }

    return { optionText: texts.join(' / '), optionCents };
  }

  /** 会员立减额 = 基础价 - 会员价；没有会员价或没有优惠时返回 null。 */
  private memberCents(dish: Dish, member: Member): number | null {
    if (dish.memberPrice === null || member.status === 'disabled') {
      return null;
    }
    const delta = toCents(dish.price) - toCents(dish.memberPrice);
    return delta > 0 ? delta : null;
  }

  /** 累计每种菜品/规格要扣多少库存，超库存直接报错。 */
  private reserveStock(dish: Dish, sku: DishSku | null, quantity: number, plan: StockPlan): void {
    if (sku) {
      const key = skuStockKey(sku.id);
      const already = plan.get(key) ?? 0;
      if (sku.stock !== null && sku.stock < already + quantity) {
        throw BusinessException.badRequest(
          `「${dish.name} · ${sku.name}」库存仅剩 ${Math.max(sku.stock - already, 0)} 份`,
        );
      }
      plan.set(key, already + quantity);
    }

    if (dish.stockType !== StockType.Fixed) {
      return;
    }
    const key = dishStockKey(dish.id);
    const already = plan.get(key) ?? 0;
    const remaining = dish.stock ?? 0;
    if (remaining < already + quantity) {
      throw BusinessException.badRequest(`「${dish.name}」库存仅剩 ${Math.max(remaining - already, 0)} 份`);
    }
    plan.set(key, already + quantity);
  }
}

/** 菜品与规格 ID 都是自增正整数，规格用负数偏移编码进同一个 Map，省掉字符串键。 */
export function dishStockKey(dishId: number): number {
  return dishId;
}

export function skuStockKey(skuId: number): number {
  return -skuId - 1;
}

/** 从库存计划里拆出要扣的菜品与规格 ID，供下单服务批量取回实体。 */
export function readStockPlan(plan: StockPlan): { dishIds: number[]; skuIds: number[] } {
  const dishIds: number[] = [];
  const skuIds: number[] = [];
  for (const key of plan.keys()) {
    if (key < 0) {
      skuIds.push(-key - 1);
    } else {
      dishIds.push(key);
    }
  }
  return { dishIds, skuIds };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** 同一菜品、同一规格、同一加料组合的行合并成一行，订单明细与餐票都不会重复打印。 */
function mergeLines(items: ClientOrderItemDto[]): ClientOrderItemDto[] {
  const merged = new Map<string, ClientOrderItemDto>();
  for (const item of items) {
    const optionSignature = (item.optionSelections ?? [])
      .map((selection) => `${selection.groupId}:${[...selection.optionNames].sort().join(',')}`)
      .sort()
      .join('|');
    const key = `${item.dishId}#${item.skuId ?? 0}#${optionSignature}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      continue;
    }
    merged.set(key, {
      ...item,
      optionSelections: item.optionSelections?.map((selection) => ({ ...selection })),
    });
  }
  return [...merged.values()];
}
