import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheKey, CacheTtl } from '../../../common/constants/cache-key';
import { StoreStatus } from '../../../common/constants/dict';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { Store } from '../../../database/entities/store.entity';
import { RedisService } from '../../redis/redis.service';
import type { UpdateStoreDto } from './dto/update-store.dto';

const DEFAULT_BUSINESS_HOURS = ['10:00-14:00', '17:00-21:00'];

@Injectable()
export class StoreService {
  private readonly stores: TenantRepo<Store>;

  constructor(
    @InjectRepository(Store) storeRepository: Repository<Store>,
    private readonly redis: RedisService,
  ) {
    this.stores = new TenantRepo(storeRepository);
  }

  async get(merchantId: number): Promise<Store> {
    const cacheKey = CacheKey.store(merchantId);
    const cached = await this.redis.getJson<Store>(cacheKey);
    if (cached) {
      return cached;
    }

    const store = await this.ensureStore(merchantId);
    await this.redis.setJson(cacheKey, store, CacheTtl.store);
    return store;
  }

  async update(merchantId: number, dto: UpdateStoreDto): Promise<Store> {
    const store = await this.ensureStore(merchantId);
    const saved = await this.stores.update(merchantId, store.id, dto);
    await this.redis.del(CacheKey.store(merchantId));
    return saved;
  }

  /** 门店是商户必有的基础数据，历史数据缺失时补齐默认值，避免商家端首屏报错。 */
  private async ensureStore(merchantId: number): Promise<Store> {
    const existing = await this.stores.findBy(merchantId, {});
    if (existing) {
      return existing;
    }
    return this.stores.create(merchantId, {
      name: '未命名门店',
      businessHours: DEFAULT_BUSINESS_HOURS,
      status: StoreStatus.Closed,
    });
  }
}
