import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  type DeepPartial,
  type EntityManager,
  type FindOptionsWhere,
  Like,
  type Repository,
} from 'typeorm';
import { DishStatus, OptionGroupType, StockType } from '../../../common/constants/dict';
import type { PageResult } from '../../../common/dto/page-result.dto';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { likePattern } from '../../../common/utils/like.util';
import { Category } from '../../../database/entities/category.entity';
import { Dish } from '../../../database/entities/dish.entity';
import {
  DishOptionGroup,
  type DishOptionItem,
} from '../../../database/entities/dish-option-group.entity';
import { DishSku } from '../../../database/entities/dish-sku.entity';
import type { DishOptionItemInputDto } from './dto/dish.dto';
import {
  type DishBrief,
  type DishDetail,
  type DishInputDto,
  type DishQueryDto,
  type UpdateDishDto,
  type UpdateDishStatusDto,
} from './dto/dish.dto';

/** 只有这些标量字段直接落在 dish 表上，规格与加料分组各自成表。 */
const DISH_SCALAR_FIELDS = [
  'categoryId',
  'name',
  'subtitle',
  'image',
  'description',
  'price',
  'memberPrice',
  'unit',
  'stockType',
  'stock',
  'sort',
  'isRecommend',
  'tags',
  'status',
] as const;

@Injectable()
export class DishService {
  private readonly dishes: TenantRepo<Dish>;
  private readonly skus: TenantRepo<DishSku>;
  private readonly optionGroups: TenantRepo<DishOptionGroup>;
  private readonly categories: TenantRepo<Category>;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Dish) dishRepository: Repository<Dish>,
    @InjectRepository(DishSku) skuRepository: Repository<DishSku>,
    @InjectRepository(DishOptionGroup) optionGroupRepository: Repository<DishOptionGroup>,
    @InjectRepository(Category) categoryRepository: Repository<Category>,
  ) {
    this.dishes = new TenantRepo(dishRepository);
    this.skus = new TenantRepo(skuRepository);
    this.optionGroups = new TenantRepo(optionGroupRepository);
    this.categories = new TenantRepo(categoryRepository);
  }

  async page(merchantId: number, query: DishQueryDto): Promise<PageResult<DishBrief>> {
    const base: FindOptionsWhere<Dish> = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const keyword = query.keyword?.trim();
    const where: FindOptionsWhere<Dish> | FindOptionsWhere<Dish>[] = keyword
      ? [
          { ...base, name: Like(likePattern(keyword)) },
          { ...base, subtitle: Like(likePattern(keyword)) },
        ]
      : base;

    const result = await this.dishes.page(merchantId, query, {
      where,
      relations: { category: true },
      order: { sort: 'ASC', id: 'DESC' },
    });

    return { ...result, list: result.list.map((dish) => this.toBrief(dish)) };
  }

  async detail(merchantId: number, id: number): Promise<DishDetail> {
    const dish = await this.dishes.findById(merchantId, id, {
      relations: { category: true, skus: true, optionGroups: true },
    });
    return { ...this.toBrief(dish), skus: dish.skus ?? [], optionGroups: dish.optionGroups ?? [] };
  }

  async create(merchantId: number, dto: DishInputDto): Promise<DishDetail> {
    await this.assertCategoryOwned(merchantId, dto.categoryId);

    const created = await this.dataSource.transaction(async (manager) => {
      const dishes = new TenantRepo(manager.getRepository(Dish));
      const dish = await dishes.create(merchantId, {
        ...this.pickScalars(dto),
        status: dto.status ?? DishStatus.OnSale,
      });
      await this.writeChildren(manager, merchantId, dish.id, dto);
      return dish;
    });

    return this.detail(merchantId, created.id);
  }

  async update(merchantId: number, id: number, dto: UpdateDishDto): Promise<DishDetail> {
    if (dto.categoryId !== undefined) {
      await this.assertCategoryOwned(merchantId, dto.categoryId);
    }

    await this.dataSource.transaction(async (manager) => {
      const dishes = new TenantRepo(manager.getRepository(Dish));
      await dishes.update(merchantId, id, this.pickScalars(dto));
      await this.writeChildren(manager, merchantId, id, dto);
    });

    return this.detail(merchantId, id);
  }

  async updateStatus(
    merchantId: number,
    id: number,
    dto: UpdateDishStatusDto,
  ): Promise<DishBrief> {
    const dish = await this.dishes.update(merchantId, id, { status: dto.status });
    return this.toBrief(dish);
  }

  async remove(merchantId: number, id: number): Promise<void> {
    // 规格与加料分组由数据库 ON DELETE CASCADE 一并清理
    await this.dishes.remove(merchantId, id);
  }

  private async writeChildren(
    manager: EntityManager,
    merchantId: number,
    dishId: number,
    dto: DishInputDto | UpdateDishDto,
  ): Promise<void> {
    if (dto.skus !== undefined) {
      const skus = new TenantRepo(manager.getRepository(DishSku));
      await skus.deleteWhere(merchantId, { dishId });
      await skus.createMany(
        merchantId,
        dto.skus.map((sku, index) => ({ ...sku, dishId, sort: sku.sort ?? index })),
      );
    }

    if (dto.optionGroups !== undefined) {
      const groups = new TenantRepo(manager.getRepository(DishOptionGroup));
      await groups.deleteWhere(merchantId, { dishId });
      await groups.createMany(
        merchantId,
        dto.optionGroups.map((group, index) => ({
          ...group,
          dishId,
          type: group.type ?? OptionGroupType.Single,
          sort: group.sort ?? index,
          options: this.normalizeOptions(group.options),
        })),
      );
    }
  }

  private normalizeOptions(items: DishOptionItemInputDto[]): DishOptionItem[] {
    return items.map((item, index) => ({
      name: item.name,
      priceDelta: item.priceDelta,
      sort: item.sort ?? index,
    }));
  }

  private pickScalars(dto: DishInputDto | UpdateDishDto): DeepPartial<Dish> {
    const patch: Record<string, unknown> = {};
    for (const field of DISH_SCALAR_FIELDS) {
      const value = dto[field];
      if (value !== undefined) {
        patch[field] = value;
      }
    }
    if (dto.stockType === StockType.Unlimited) {
      patch.stock = null;
    }
    return patch as DeepPartial<Dish>;
  }

  private async assertCategoryOwned(merchantId: number, categoryId: number): Promise<void> {
    await this.categories.findById(merchantId, categoryId);
  }

  private toBrief(dish: Dish): DishBrief {
    const { category, ...rest } = dish;
    return { ...rest, categoryName: category?.name ?? '' };
  }
}
