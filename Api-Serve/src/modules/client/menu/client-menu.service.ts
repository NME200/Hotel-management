import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import {
  CategoryStatus,
  DishStatus,
  StockType,
} from '../../../common/constants/dict';
import { CacheKey, CacheTtl } from '../../../common/constants/cache-key';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { likePattern } from '../../../common/utils/like.util';
import { toCents, toYuan } from '../../../common/utils/money.util';
import { Category } from '../../../database/entities/category.entity';
import { Dish } from '../../../database/entities/dish.entity';
import { DishOptionGroup } from '../../../database/entities/dish-option-group.entity';
import { DishSku } from '../../../database/entities/dish-sku.entity';
import type {
  ClientDishBriefView,
  ClientDishDetailView,
  ClientMenuCategoryView,
  ClientMenuView,
  ClientOptionGroupView,
  ClientSkuView,
} from '../models/client-menu.model';
import { ClientPromotionService } from '../promotion/client-promotion.service';
import { RedisService } from '../../redis/redis.service';

/** 首页推荐位与详情页搭配推荐的取数上限。 */
const RECOMMEND_LIMIT = 6;
const RELATED_LIMIT = 6;
const SEARCH_LIMIT = 30;

/**
 * 顾客侧菜单：只暴露「在售 + 启用分类」的菜品，且把商家端字段翻译成顾客需要的形态。
 *
 * 缓存策略：整棵菜单树按商户缓 60 秒，商家改价改库存后最多 60 秒自然生效。
 * 没有让商家端写操作反向来清缓存，是因为那会让 MerchantModule 依赖 ClientModule，
 * 换来的一分钟延迟并不值得引入这条依赖；库存与下架在下单时还会再校验一次。
 */
@Injectable()
export class ClientMenuService {
  private readonly dishes: TenantRepo<Dish>;
  private readonly categories: TenantRepo<Category>;
  private readonly skus: TenantRepo<DishSku>;
  private readonly optionGroups: TenantRepo<DishOptionGroup>;

  constructor(
    @InjectRepository(Dish) dishRepository: Repository<Dish>,
    @InjectRepository(Category) categoryRepository: Repository<Category>,
    @InjectRepository(DishSku) skuRepository: Repository<DishSku>,
    @InjectRepository(DishOptionGroup) optionGroupRepository: Repository<DishOptionGroup>,
    private readonly promotions: ClientPromotionService,
    private readonly redis: RedisService,
  ) {
    this.dishes = new TenantRepo(dishRepository);
    this.categories = new TenantRepo(categoryRepository);
    this.skus = new TenantRepo(skuRepository);
    this.optionGroups = new TenantRepo(optionGroupRepository);
  }

  async menu(merchantId: number): Promise<ClientMenuView> {
    const cacheKey = CacheKey.clientMenu(merchantId);
    const cached = await this.redis.getJson<ClientMenuView>(cacheKey);
    if (cached) {
      await this.stampPromotions(merchantId, cached.categories.flatMap((category) => category.dishes));
      return cached;
    }

    const [categoryRows, dishRows] = await Promise.all([
      this.categories.list(merchantId, {
        where: { status: CategoryStatus.Enabled },
        order: { sort: 'ASC', id: 'ASC' },
      }),
      this.dishes.list(merchantId, {
        where: { status: DishStatus.OnSale },
        order: { sort: 'ASC', id: 'ASC' },
      }),
    ]);

    const skuMap = await this.groupSkus(merchantId, dishRows.map((dish) => dish.id));
    const optionMap = await this.groupOptions(merchantId, dishRows.map((dish) => dish.id));
    const briefs = new Map(
      dishRows.map(
        (dish) =>
          [
            dish.id,
            this.toBrief(dish, skuMap.get(dish.id) ?? [], optionMap.get(dish.id) ?? []),
          ] as const,
      ),
    );

    // 未启用分类下的菜品一并隐藏：顾客看到的必须是一套自洽的菜单
    const categories: ClientMenuCategoryView[] = categoryRows
      .map((category) => ({
        id: category.id,
        name: category.name,
        icon: category.image,
        dishes: dishRows
          .filter((dish) => dish.categoryId === category.id)
          .map((dish) => briefs.get(dish.id)!),
      }))
      .filter((category) => category.dishes.length > 0);

    const view = { categories, generatedAt: new Date() };
    await this.redis.setJson(cacheKey, view, CacheTtl.clientMenu);
    await this.stampPromotions(merchantId, categories.flatMap((category) => category.dishes));
    return view;
  }

  async recommend(merchantId: number): Promise<ClientDishBriefView[]> {
    const menu = await this.menu(merchantId);
    const all = menu.categories.flatMap((category) => category.dishes);
    const recommended = all.filter((dish) => dish.isRecommend && !dish.soldOut);
    if (recommended.length > 0) {
      return recommended.slice(0, RECOMMEND_LIMIT);
    }
    // 一家店可能一个招牌都没标，退化成按销量给推荐位，首页不至于空着
    return [...all]
      .filter((dish) => !dish.soldOut)
      .sort((a, b) => b.salesCount - a.salesCount)
      .slice(0, RECOMMEND_LIMIT);
  }

  async dishDetail(merchantId: number, dishId: number): Promise<ClientDishDetailView> {
    const dish = await this.dishes.findBy(merchantId, {
      id: dishId,
      status: DishStatus.OnSale,
    });
    if (!dish) {
      throw BusinessException.notFound('菜品不存在或已下架');
    }

    const siblings = await this.dishes.list(merchantId, {
      where: { categoryId: dish.categoryId, status: DishStatus.OnSale },
      order: { salesCount: 'DESC' },
      take: RELATED_LIMIT + 1,
    });
    // 详情本体与搭配推荐一次取齐规格/加料，两边走同一套价差计算
    const ids = [dish.id, ...siblings.map((item) => item.id)];
    const skuMap = await this.groupSkus(merchantId, ids);
    const optionMap = await this.groupOptions(merchantId, ids);
    const skus = skuMap.get(dish.id) ?? [];
    const optionGroups = optionMap.get(dish.id) ?? [];

    const view: ClientDishDetailView = {
      ...this.toBrief(dish, skus, optionGroups),
      description: dish.description,
      skus,
      optionGroups,
      related: siblings
        .filter((item) => item.id !== dish.id)
        .slice(0, RELATED_LIMIT)
        .map((item) =>
          this.toBrief(item, skuMap.get(item.id) ?? [], optionMap.get(item.id) ?? []),
        ),
    };
    await this.stampPromotions(merchantId, [view, ...view.related]);
    return view;
  }

  /** 搜索只查 dish 表：名称、副标题、分类名一起命中，避免顾客搜「招牌」搜不出来。 */
  async search(merchantId: number, keyword: string): Promise<ClientDishBriefView[]> {
    const trimmed = keyword.trim();
    if (!trimmed) {
      return [];
    }
    const pattern = likePattern(trimmed);

    const matchedCategories = await this.categories.list(merchantId, {
      where: { status: CategoryStatus.Enabled, name: Like(pattern) },
      select: { id: true },
    });

    const where = [
      { name: Like(pattern), status: DishStatus.OnSale },
      { subtitle: Like(pattern), status: DishStatus.OnSale },
      ...(matchedCategories.length
        ? [
            {
              categoryId: In(matchedCategories.map((item) => item.id)),
              status: DishStatus.OnSale,
            },
          ]
        : []),
    ];

    const rows = await this.dishes.list(merchantId, { where, take: SEARCH_LIMIT });
    const ids = rows.map((dish) => dish.id);
    const skuMap = await this.groupSkus(merchantId, ids);
    const optionMap = await this.groupOptions(merchantId, ids);
    const briefs = rows.map((dish) => this.toBrief(dish, skuMap.get(dish.id) ?? [], optionMap.get(dish.id) ?? []));
    await this.stampPromotions(merchantId, briefs);
    return briefs;
  }

  /* ------------------------------ 内部 ------------------------------ */

  private async loadSkus(merchantId: number, dishIds: number[]): Promise<ClientSkuView[]> {
    if (dishIds.length === 0) {
      return [];
    }
    const rows = await this.skus.list(merchantId, {
      where: { dishId: In(dishIds) },
      order: { sort: 'ASC', id: 'ASC' },
    });
    return rows.map((sku) => this.toSku(sku, sku.price));
  }

  private async loadOptions(
    merchantId: number,
    dishIds: number[],
  ): Promise<ClientOptionGroupView[]> {
    if (dishIds.length === 0) {
      return [];
    }
    const rows = await this.optionGroups.list(merchantId, {
      where: { dishId: In(dishIds) },
      order: { sort: 'ASC', id: 'ASC' },
    });
    return rows.map((group) => this.toOptionGroup(group));
  }

  private async groupSkus(
    merchantId: number,
    dishIds: number[],
  ): Promise<Map<number, ClientSkuView[]>> {
    const grouped = new Map<number, ClientSkuView[]>();
    if (dishIds.length === 0) {
      return grouped;
    }
    const rows = await this.skus.list(merchantId, {
      where: { dishId: In(dishIds) },
      order: { sort: 'ASC', id: 'ASC' },
    });
    const basePrices = new Map(
      (
        await this.dishes.list(merchantId, {
          where: { id: In([...new Set(rows.map((row) => row.dishId))]) },
          select: { id: true, price: true },
        })
      ).map((dish) => [dish.id, dish.price] as const),
    );
    for (const sku of rows) {
      const base = basePrices.get(sku.dishId) ?? sku.price;
      const list = grouped.get(sku.dishId) ?? [];
      list.push(this.toSku(sku, base));
      grouped.set(sku.dishId, list);
    }
    return grouped;
  }

  private async groupOptions(
    merchantId: number,
    dishIds: number[],
  ): Promise<Map<number, ClientOptionGroupView[]>> {
    const grouped = new Map<number, ClientOptionGroupView[]>();
    if (dishIds.length === 0) {
      return grouped;
    }
    for (const group of await this.optionGroups.list(merchantId, {
      where: { dishId: In(dishIds) },
      order: { sort: 'ASC', id: 'ASC' },
    })) {
      const list = grouped.get(group.dishId) ?? [];
      list.push(this.toOptionGroup(group));
      grouped.set(group.dishId, list);
    }
    return grouped;
  }

  private toOptionGroup(group: DishOptionGroup): ClientOptionGroupView {
    return {
      id: group.id,
      name: group.name,
      type: group.type,
      required: group.required,
      sort: group.sort,
      options: [...(group.options ?? [])]
        .sort((a, b) => a.sort - b.sort)
        .map((option) => ({
          name: option.name,
          priceDelta: option.priceDelta,
          sort: option.sort,
        })),
    };
  }

  private toSku(sku: DishSku, basePrice: number): ClientSkuView {
    return {
      id: sku.id,
      name: sku.name,
      price: sku.price,
      specDesc: sku.specDesc,
      stock: sku.stock,
      soldOut: sku.stock !== null && sku.stock <= 0,
      priceDelta: Number((sku.price - basePrice).toFixed(2)),
      sort: sku.sort,
    };
  }

  /**
   * 会员价按「立减额」落地：dish.memberPrice 只给了基础价的会员价，
   * 顾客选了大份时，会员价应当是「大份价 - 同一立减额」而不是退回基础会员价。
   */
  /**
   * 活动价在菜单缓存之外追加。
   *
   * 菜单按门店缓存，而活动有开始/结束时间：把价格烙进缓存会出现「活动已结束还在打折」，
   * 结算价与展示价也就对不上了。所以缓存里只放基础菜单，每次请求现算活动。
   * setJson 在 await 内就已经序列化完，之后改 view 不会污染缓存内容。
   */
  private async stampPromotions(
    merchantId: number,
    dishes: ClientDishBriefView[],
  ): Promise<void> {
    const promotions = await this.promotions.activeOf(merchantId);
    for (const dish of dishes) {
      const baseCents = toCents(dish.price);
      const hit = this.promotions.bestFor(promotions, dish, baseCents);
      const promoPrice = hit === null ? null : toYuan(Math.max(baseCents - hit.deltaCents, 0));
      dish.promotionId = hit?.promotionId ?? null;
      dish.promotionBadge = hit?.badge ?? null;
      dish.promotionPrice = promoPrice;
      /**
       * 活动价压过会员价时，会员那行提示要撤掉：
       * 成交只取低的一方，留着「会员省 ¥3」就是给了一个不会发生的承诺。
       */
      if (promoPrice !== null && dish.memberPrice !== null && promoPrice <= dish.memberPrice) {
        dish.memberTip = null;
      }
    }
  }

  private toBrief(
    dish: Dish,
    skus: ClientSkuView[],
    optionGroups: ClientOptionGroupView[],
  ): ClientDishBriefView {
    const memberPrice = dish.memberPrice ?? null;
    return {
      id: dish.id,
      categoryId: dish.categoryId,
      name: dish.name,
      subtitle: dish.subtitle,
      image: dish.image,
      price: dish.price,
      memberPrice,
      memberDiscount: memberPrice === null ? 0 : Number((dish.price - memberPrice).toFixed(2)),
      memberTip: memberPrice === null
        ? null
        : `会员省 ¥${Number((dish.price - memberPrice).toFixed(2))}`,
      promotionId: null,
      promotionBadge: null,
      promotionPrice: null,
      unit: dish.unit,
      tags: dish.tags ?? [],
      salesCount: dish.salesCount,
      stock: dish.stockType === StockType.Fixed ? dish.stock : null,
      soldOut: dish.stockType === StockType.Fixed && (dish.stock ?? 0) <= 0,
      isRecommend: dish.isRecommend,
      needChoose: skus.length > 0 || optionGroups.length > 0,
      skuCount: skus.length,
      optionGroupCount: optionGroups.length,
    };
  }
}
