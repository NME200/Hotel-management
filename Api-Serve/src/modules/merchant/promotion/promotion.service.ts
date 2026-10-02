import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, type FindOptionsWhere, type Repository } from 'typeorm';
import {
  CouponScopeType,
  PromotionStatus,
  PromotionType,
} from '../../../common/constants/dict';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { buildPageResult, type PageResult } from '../../../common/dto/page-result.dto';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { likePattern } from '../../../common/utils/like.util';
import { parseLocalDateTime } from '../../../common/utils/local-date-time.util';
import { toCents } from '../../../common/utils/money.util';
import { Activity } from '../../../database/entities/activity.entity';
import { Promotion } from '../../../database/entities/promotion.entity';
import {
  PromotionQueryDto,
  CreatePromotionDto,
  UpdatePromotionDto,
} from './dto/promotion.dto';

/**
 * 商家端限时活动：改的是成交价，所以这里的校验比运营位严格。
 *
 * 配错价格的代价是直接亏钱或顾客投诉，因此「算法与数值必须成对」
 * 「活动价不能高于原价」「范围选了菜品就必须给出菜品」都在写入时挡掉。
 */
@Injectable()
export class PromotionService {
  private readonly promotions: TenantRepo<Promotion>;
  private readonly activities: TenantRepo<Activity>;

  constructor(
    @InjectRepository(Promotion) repository: Repository<Promotion>,
    @InjectRepository(Activity) activityRepository: Repository<Activity>,
  ) {
    this.promotions = new TenantRepo(repository);
    this.activities = new TenantRepo(activityRepository);
  }

  async page(
    merchantId: number,
    query: PromotionQueryDto,
  ): Promise<PageResult<Promotion>> {
    const where: FindOptionsWhere<Promotion> = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.keyword) {
      where.name = Like(likePattern(query.keyword));
    }

    const result = await this.promotions.page(merchantId, query, {
      where,
      order: { id: 'DESC' },
    });
    return buildPageResult(result.list, result.total, result.page, result.pageSize);
  }

  async create(merchantId: number, dto: CreatePromotionDto): Promise<Promotion> {
    await this.assertNameFree(merchantId, dto.name, null);
    const data = this.toColumns(dto);
    return this.promotions.create(merchantId, data);
  }

  async update(
    merchantId: number,
    id: number,
    dto: UpdatePromotionDto,
  ): Promise<Promotion> {
    const current = await this.promotions.findById(merchantId, id);
    if (dto.name && dto.name !== current.name) {
      await this.assertNameFree(merchantId, dto.name, id);
    }

    const changes: Partial<Promotion> = {};
    if (dto.name !== undefined) changes.name = dto.name;
    if (dto.badge !== undefined) changes.badge = dto.badge;
    if (dto.status !== undefined) changes.status = dto.status;

    const type = dto.type ?? current.type;
    const price = dto.price === undefined ? fromCents(current.priceCents) : dto.price;
    const discount =
      dto.discount === undefined ? ratioOf(current.discountRatio) : dto.discount;
    if (dto.type !== undefined || dto.price !== undefined || dto.discount !== undefined) {
      Object.assign(changes, this.valueColumns(type, price, discount));
    }

    if (dto.scopeType !== undefined || dto.scopeIds !== undefined) {
      const scopeType = dto.scopeType ?? current.scopeType;
      const scopeIds = dto.scopeIds === undefined ? current.scopeIds : dto.scopeIds;
      Object.assign(changes, this.scopeColumns(scopeType, scopeIds));
    }

    if (dto.startsAt !== undefined || dto.endsAt !== undefined) {
      Object.assign(
        changes,
        this.resolveTimes(
          dto.startsAt === undefined ? toInput(current.startsAt) : dto.startsAt,
          dto.endsAt === undefined ? toInput(current.endsAt) : dto.endsAt,
        ),
      );
    }
    return this.promotions.update(merchantId, id, changes);
  }

  async updateStatus(
    merchantId: number,
    id: number,
    status: PromotionStatus,
  ): Promise<Promotion> {
    await this.promotions.findById(merchantId, id);
    return this.promotions.update(merchantId, id, { status });
  }

  async remove(merchantId: number, id: number): Promise<void> {
    const promotion = await this.promotions.findById(merchantId, id);
    const linked = await this.activities.count(merchantId, { promotionId: id });
    if (linked > 0) {
      throw BusinessException.conflict(
        `有 ${linked} 张运营位卡关联了这个活动，请先在「活动运营位」里解除关联`,
      );
    }
    await this.promotions.removeEntity(promotion);
  }

  private toColumns(dto: CreatePromotionDto) {
    return {
      name: dto.name,
      badge: dto.badge ?? null,
      status: dto.status,
      ...this.valueColumns(dto.type, dto.price, dto.discount),
      ...this.scopeColumns(dto.scopeType, dto.scopeIds),
      ...this.resolveTimes(dto.startsAt, dto.endsAt),
    };
  }

  /** 算法与数值成对：活动价还要真的比原价低，否则顾客端会出现「有活动标但价格没变」。 */
  private valueColumns(
    type: PromotionType,
    price?: number | null,
    discount?: number | null,
  ): Pick<Promotion, 'type' | 'priceCents' | 'discountRatio'> {
    if (type === PromotionType.Price) {
      if (price === null || price === undefined) {
        throw BusinessException.badRequest('按活动价时需要填写活动价');
      }
      return { type, priceCents: toCents(price), discountRatio: null };
    }
    if (discount === null || discount === undefined) {
      throw BusinessException.badRequest('按折扣时需要填写折扣，0.6 表示 6 折');
    }
    return {
      type,
      priceCents: null,
      discountRatio: Number(discount.toFixed(4)),
    };
  }

  private scopeColumns(
    scopeType: CouponScopeType,
    scopeIds?: number[] | null,
  ): Pick<Promotion, 'scopeType' | 'scopeIds'> {
    if (scopeType === CouponScopeType.All) {
      return { scopeType, scopeIds: null };
    }
    const ids = (scopeIds ?? []).filter((item) => Number.isInteger(item) && item > 0);
    if (ids.length === 0) {
      throw BusinessException.badRequest(
        scopeType === CouponScopeType.Dish ? '请至少选择一个菜品' : '请至少选择一个分类',
      );
    }
    return { scopeType, scopeIds: [...new Set(ids)] };
  }

  private resolveTimes(startsAt?: string | null, endsAt?: string | null) {
    const from = parseLocalDateTime(startsAt);
    const to = parseLocalDateTime(endsAt);
    if (from && to && to.getTime() <= from.getTime()) {
      throw BusinessException.badRequest('结束时间必须晚于开始时间');
    }
    return { startsAt: from, endsAt: to };
  }

  private async assertNameFree(
    merchantId: number,
    name: string,
    exceptId: number | null,
  ): Promise<void> {
    const existed = await this.promotions.findBy(merchantId, { name });
    if (existed && existed.id !== exceptId) {
      throw BusinessException.conflict('同名活动已存在');
    }
  }
}

function fromCents(cents: number | null): number | null {
  return cents === null ? null : cents / 100;
}

function ratioOf(ratio: string | number | null): number | null {
  return ratio === null ? null : Number(ratio);
}

/** 库里的 Date 回灌给 resolveTimes 前先还原成本地字符串，避免二次时区偏移。 */
function toInput(value: Date | null): string | null {
  if (!value) {
    return null;
  }
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(
    value.getHours(),
  )}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}
