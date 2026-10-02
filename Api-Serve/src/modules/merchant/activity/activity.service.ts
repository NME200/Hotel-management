import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, type FindOptionsWhere, type Repository } from 'typeorm';
import { ActivityAction, ActivityStatus } from '../../../common/constants/dict';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { buildPageResult, type PageResult } from '../../../common/dto/page-result.dto';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { likePattern } from '../../../common/utils/like.util';
import { parseLocalDateTime } from '../../../common/utils/local-date-time.util';
import { Activity } from '../../../database/entities/activity.entity';
import { Promotion } from '../../../database/entities/promotion.entity';
import {
  ActivityQueryDto,
  CreateActivityDto,
  UpdateActivityDto,
} from './dto/activity.dto';

/**
 * 商家端运营位活动。
 *
 * 这里的写入直接决定小程序首页显示什么，所以时间一律按本地时区解析、
 * 起止顺序必须自洽，不给顾客端留「点了没反应 / 永远不生效」的脏配置。
 */
@Injectable()
export class ActivityService {
  private readonly activities: TenantRepo<Activity>;
  private readonly promotions: TenantRepo<Promotion>;

  constructor(
    @InjectRepository(Activity) repository: Repository<Activity>,
    @InjectRepository(Promotion) promotionRepository: Repository<Promotion>,
  ) {
    this.activities = new TenantRepo(repository);
    this.promotions = new TenantRepo(promotionRepository);
  }

  async page(
    merchantId: number,
    query: ActivityQueryDto,
  ): Promise<PageResult<Activity>> {
    const base: FindOptionsWhere<Activity> = {};
    if (query.slot) {
      base.slot = query.slot;
    }
    if (query.status) {
      base.status = query.status;
    }
    const where: FindOptionsWhere<Activity>[] | FindOptionsWhere<Activity> = query.keyword
      ? [
          { ...base, name: Like(likePattern(query.keyword)) },
          { ...base, title: Like(likePattern(query.keyword)) },
        ]
      : base;

    const result = await this.activities.page(merchantId, query, {
      where,
      order: { slot: 'ASC', sort: 'ASC', id: 'ASC' },
    });
    return buildPageResult(result.list, result.total, result.page, result.pageSize);
  }

  async create(merchantId: number, dto: CreateActivityDto): Promise<Activity> {
    await this.assertNameFree(merchantId, dto.name, null);
    const times = this.resolveTimes(dto.startsAt, dto.endsAt);
    const action = dto.action ?? ActivityAction.None;
    const promotionId = await this.resolvePromotion(merchantId, action, dto.promotionId);
    return this.activities.create(merchantId, {
      name: dto.name,
      slot: dto.slot,
      title: dto.title,
      subTitle: dto.subTitle ?? null,
      icon: dto.icon ?? null,
      action,
      promotionId,
      status: dto.status,
      sort: dto.sort,
      ...times,
    });
  }

  async update(
    merchantId: number,
    id: number,
    dto: UpdateActivityDto,
  ): Promise<Activity> {
    const current = await this.activities.findById(merchantId, id);
    if (dto.name && dto.name !== current.name) {
      await this.assertNameFree(merchantId, dto.name, id);
    }

    const changes: Partial<Activity> = {};
    if (dto.name !== undefined) changes.name = dto.name;
    if (dto.slot !== undefined) changes.slot = dto.slot;
    if (dto.title !== undefined) changes.title = dto.title;
    if (dto.subTitle !== undefined) changes.subTitle = dto.subTitle;
    if (dto.icon !== undefined) changes.icon = dto.icon;
    if (dto.action !== undefined) changes.action = dto.action;
    if (dto.action !== undefined || dto.promotionId !== undefined) {
      changes.promotionId = await this.resolvePromotion(
        merchantId,
        dto.action ?? current.action,
        dto.promotionId === undefined ? current.promotionId : dto.promotionId,
      );
    }
    if (dto.status !== undefined) changes.status = dto.status;
    if (dto.sort !== undefined) changes.sort = dto.sort;
    if (dto.startsAt !== undefined || dto.endsAt !== undefined) {
      Object.assign(
        changes,
        this.resolveTimes(
          dto.startsAt === undefined ? toInput(current.startsAt) : dto.startsAt,
          dto.endsAt === undefined ? toInput(current.endsAt) : dto.endsAt,
        ),
      );
    }
    return this.activities.update(merchantId, id, changes);
  }

  async updateStatus(
    merchantId: number,
    id: number,
    status: ActivityStatus,
  ): Promise<Activity> {
    await this.activities.findById(merchantId, id);
    return this.activities.update(merchantId, id, { status });
  }

  async remove(merchantId: number, id: number): Promise<void> {
    const activity = await this.activities.findById(merchantId, id);
    await this.activities.removeEntity(activity);
  }

  /**
   * 关联活动只在「点击跳转=限时活动」时才有意义。
   *
   * 挡掉两种配错：选了跳活动却没给活动 ID（顾客点了没反应），
   * 以及给了别家商户的活动 ID（跨租户）。
   */
  private async resolvePromotion(
    merchantId: number,
    action: ActivityAction,
    promotionId?: number | null,
  ): Promise<number | null> {
    if (action !== ActivityAction.Promotion) {
      return null;
    }
    if (!promotionId) {
      throw BusinessException.badRequest('跳转选择「限时活动」时必须关联一个活动');
    }
    const promotion = await this.promotions.findById(merchantId, promotionId).catch(() => null);
    if (!promotion) {
      throw BusinessException.badRequest('关联的限时活动不存在，请重新选择');
    }
    return promotion.id;
  }

  /** 起止时间成对解析：只改一端时另一端沿用库里的值，避免半套新值。 */
  private resolveTimes(
    startsAt?: string | null,
    endsAt?: string | null,
  ): { startsAt: Date | null; endsAt: Date | null } {
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
    const existed = await this.activities.findBy(merchantId, { name });
    if (existed && existed.id !== exceptId) {
      throw BusinessException.conflict('同名活动已存在');
    }
  }
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
