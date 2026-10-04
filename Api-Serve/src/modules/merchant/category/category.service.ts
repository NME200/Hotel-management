import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, type FindOptionsWhere, type Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { CacheKey } from '../../../common/constants/cache-key';
import { RedisService } from '../../redis/redis.service';
import { likePattern } from '../../../common/utils/like.util';
import { buildPageResult, type PageResult } from '../../../common/dto/page-result.dto';
import { Category } from '../../../database/entities/category.entity';
import { Dish } from '../../../database/entities/dish.entity';
import {
  type CategoryItem,
  type CategoryQueryDto,
  type CreateCategoryDto,
  type UpdateCategoryDto,
} from './dto/category.dto';

@Injectable()
export class CategoryService {
  private readonly categories: TenantRepo<Category>;
  private readonly dishes: TenantRepo<Dish>;

  constructor(
    @InjectRepository(Category) categoryRepository: Repository<Category>,
    @InjectRepository(Dish) dishRepository: Repository<Dish>,
    private readonly redis: RedisService,
  ) {
    this.categories = new TenantRepo(categoryRepository);
    this.dishes = new TenantRepo(dishRepository);
  }

  /** 分类改名或停用会连带改变顾客端菜单结构，改完必须清掉门店菜单缓存。 */
  private invalidateClientMenu(merchantId: number): Promise<unknown> {
    return this.redis.del(CacheKey.clientMenu(merchantId));
  }

  async page(merchantId: number, query: CategoryQueryDto): Promise<PageResult<CategoryItem>> {
    const where: FindOptionsWhere<Category> = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.keyword) {
      where.name = Like(`%${query.keyword}%`);
    }

    const result = await this.categories.page(merchantId, query, {
      where,
      order: { sort: 'ASC', id: 'ASC' },
    });
    const counts = await this.countDishes(merchantId, result.list.map((item) => item.id));

    return buildPageResult(
      result.list.map((item) => ({ ...item, dishCount: counts.get(item.id) ?? 0 })),
      result.total,
      result.page,
      result.pageSize,
    );
  }

  async create(merchantId: number, dto: CreateCategoryDto): Promise<Category> {
    if (await this.categories.exists(merchantId, { name: dto.name })) {
      throw BusinessException.conflict('同名分类已存在');
    }
    const created = await this.categories.create(merchantId, dto);
    await this.invalidateClientMenu(merchantId);
    return created;
  }

  async update(merchantId: number, id: number, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.categories.findById(merchantId, id);
    if (dto.name && dto.name !== category.name) {
      if (await this.categories.exists(merchantId, { name: dto.name })) {
        throw BusinessException.conflict('同名分类已存在');
      }
    }
    const saved = await this.categories.update(merchantId, id, dto);
    await this.invalidateClientMenu(merchantId);
    return saved;
  }

  async remove(merchantId: number, id: number): Promise<void> {
    const category = await this.categories.findById(merchantId, id);
    const used = await this.dishes.count(merchantId, { categoryId: id });
    if (used > 0) {
      throw BusinessException.conflict(`该分类下有 ${used} 个菜品，请先删除或移出`);
    }
    await this.categories.removeEntity(category);
    await this.invalidateClientMenu(merchantId);
  }

  /** 一次查询拿到菜品所属分类，避免按分类循环 count。 */
  private async countDishes(merchantId: number, categoryIds: number[]): Promise<Map<number, number>> {
    const counts = new Map<number, number>();
    if (categoryIds.length === 0) {
      return counts;
    }
    const rows = await this.dishes.list(merchantId, {
      where: { categoryId: In(categoryIds) },
      select: { id: true, categoryId: true },
    });
    for (const row of rows) {
      counts.set(row.categoryId, (counts.get(row.categoryId) ?? 0) + 1);
    }
    return counts;
  }
}
