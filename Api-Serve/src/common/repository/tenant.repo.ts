import {
  type DeepPartial,
  type FindOptionsOrder,
  type FindOptionsRelations,
  type FindOptionsSelect,
  type FindOptionsWhere,
  type Repository,
} from 'typeorm';
import type { TenantBaseEntity } from '../../database/entities/base.entity';
import {
  buildPageResult,
  type PageResult,
} from '../dto/page-result.dto';
import { type PageQueryDto, toSkipTake } from '../dto/page-query.dto';
import { BusinessException } from '../exceptions/business.exception';

export interface TenantFindOptions<T> {
  where?: FindOptionsWhere<T> | FindOptionsWhere<T>[];
  relations?: FindOptionsRelations<T>;
  order?: FindOptionsOrder<T>;
  select?: FindOptionsSelect<T>;
  take?: number;
}

/**
 * 租户仓储包装：所有读写都必须显式传入 merchantId，
 * 条件由这里统一拼装，业务代码不出现任何手写 SQL，
 * 也不存在忘记带租户条件导致跨商户数据泄漏的写法。
 */
export class TenantRepo<T extends TenantBaseEntity> {
  constructor(private readonly repository: Repository<T>) {}

  private mergeWhere(
    merchantId: number,
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[],
  ): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
    if (where === undefined) {
      return { merchantId } as FindOptionsWhere<T>;
    }
    return Array.isArray(where)
      ? where.map((item) => ({ ...item, merchantId }) as FindOptionsWhere<T>)
      : ({ ...where, merchantId } as FindOptionsWhere<T>);
  }

  async page(
    merchantId: number,
    query: PageQueryDto,
    options: TenantFindOptions<T> = {},
  ): Promise<PageResult<T>> {
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [list, total] = await this.repository.findAndCount({
      where: this.mergeWhere(merchantId, options.where),
      relations: options.relations,
      select: options.select,
      order: options.order ?? ({ id: 'DESC' } as FindOptionsOrder<T>),
      skip,
      take,
    });
    return buildPageResult(list, total, query.page, query.pageSize);
  }

  async list(merchantId: number, options: TenantFindOptions<T> = {}): Promise<T[]> {
    return this.repository.find({
      where: this.mergeWhere(merchantId, options.where),
      relations: options.relations,
      select: options.select,
      order: options.order,
      take: options.take,
    });
  }

  async findById(
    merchantId: number,
    id: number,
    options: Omit<TenantFindOptions<T>, 'where'> = {},
  ): Promise<T> {
    const entity = await this.repository.findOne({
      where: this.mergeWhere(merchantId, { id } as FindOptionsWhere<T>),
      relations: options.relations,
    });
    if (!entity) {
      throw BusinessException.notFound();
    }
    return entity;
  }

  async findBy(
    merchantId: number,
    where: FindOptionsWhere<T>,
    options: Omit<TenantFindOptions<T>, 'where'> = {},
  ): Promise<T | null> {
    return this.repository.findOne({
      where: this.mergeWhere(merchantId, where),
      relations: options.relations,
    });
  }

  async count(
    merchantId: number,
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[],
  ): Promise<number> {
    return this.repository.count({ where: this.mergeWhere(merchantId, where) });
  }

  async exists(
    merchantId: number,
    where: FindOptionsWhere<T>,
  ): Promise<boolean> {
    return this.repository.exists({ where: this.mergeWhere(merchantId, where) });
  }

  async create(merchantId: number, data: DeepPartial<T>): Promise<T> {
    const entity = this.repository.create({ ...data, merchantId } as DeepPartial<T>);
    return this.repository.save(entity);
  }

  async createMany(merchantId: number, items: DeepPartial<T>[]): Promise<T[]> {
    if (items.length === 0) {
      return [];
    }
    const entities = items.map(
      (item) => this.repository.create({ ...item, merchantId } as DeepPartial<T>),
    );
    return this.repository.save(entities);
  }

  async update(
    merchantId: number,
    id: number,
    data: DeepPartial<T>,
    options: Omit<TenantFindOptions<T>, 'where'> = {},
  ): Promise<T> {
    const entity = await this.findById(merchantId, id, options);
    Object.assign(entity, data);
    return this.repository.save(entity);
  }

  async persist(entity: T): Promise<T> {
    return this.repository.save(entity);
  }

  async remove(merchantId: number, id: number): Promise<void> {
    const entity = await this.findById(merchantId, id);
    await this.repository.remove(entity);
  }

  async deleteWhere(merchantId: number, where: FindOptionsWhere<T>): Promise<void> {
    await this.repository.delete(this.mergeWhere(merchantId, where) as FindOptionsWhere<T>);
  }

  async removeEntity(entity: T): Promise<void> {
    await this.repository.remove(entity);
  }
}
