import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Like, MoreThan, Repository, type FindOptionsWhere } from 'typeorm';
import {
  DINE_TYPE_LABELS,
  DineType,
  MerchantStatus,
  StoreStatus,
} from '../../../common/constants/dict';
import { buildPageResult, type PageResult } from '../../../common/dto/page-result.dto';
import { toSkipTake } from '../../../common/dto/page-query.dto';
import type { PageQueryDto } from '../../../common/dto/page-query.dto';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { likePattern } from '../../../common/utils/like.util';
import { Merchant } from '../../../database/entities/merchant.entity';
import { Store } from '../../../database/entities/store.entity';

/** 顾客可选择的就餐方式，与后端 DineType 同一套机器码。 */
export interface DineTypeOption {
  value: DineType;
  label: string;
}

/**
 * 顾客可点的就餐方式。
 * 标签取自 DINE_TYPE_LABELS，与订单、后台列表用同一份文案，不再各写一遍。
 */
export const DINE_TYPE_OPTIONS: readonly DineTypeOption[] = [
  DineType.DineIn,
  DineType.Pickup,
  DineType.Takeout,
].map((value) => ({ value, label: DINE_TYPE_LABELS[value] }));

/** 门店对外视图：只给顾客看得见的信息，商户内部字段（联系人、到期时间）一律不出。 */
export interface ClientStoreView {
  merchantCode: string;
  merchantName: string;
  name: string;
  logo: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  phone: string | null;
  notice: string | null;
  businessHours: string[];
  status: StoreStatus;
  openNow: boolean;
  dineTypes: DineTypeOption[];
}

export interface ClientStoreListItem extends ClientStoreView {
  distanceText: string | null;
}

@Injectable()
export class ClientStoreService {
  constructor(
    @InjectRepository(Merchant) private readonly merchants: Repository<Merchant>,
    @InjectRepository(Store) private readonly stores: Repository<Store>,
  ) {}

  /**
   * 扫码定店：商户编号 -> 可用的「商户 + 门店」。
   * 商户不可用与门店不存在给出不同提示，方便顾客判断是扫错码还是店家打烊。
   */
  async resolve(merchantCode: string): Promise<{ merchant: Merchant; store: Store }> {
    const code = merchantCode.trim();
    const merchant = await this.merchants.findOne({ where: { code } });
    if (!merchant) {
      throw new NotFoundException('门店不存在，请确认小程序码或重新选择门店');
    }
    if (merchant.status !== MerchantStatus.Active) {
      throw BusinessException.forbidden('该门店暂停营业，请联系店家');
    }
    if (merchant.expireAt !== null && merchant.expireAt.getTime() < Date.now()) {
      throw BusinessException.forbidden('该门店服务已到期，暂时无法下单');
    }
    const store = await this.stores.findOne({ where: { merchantId: merchant.id } });
    if (!store) {
      throw new NotFoundException('该门店尚未完成配置');
    }
    return { merchant, store };
  }

  async context(merchantCode: string): Promise<ClientStoreView> {
    const { merchant, store } = await this.resolve(merchantCode);
    return this.toView(merchant, store);
  }

  /**
   * 兜底门店列表：一个商户一个营业门店，所以分页单位就是商户。
   * 只列 active 且未到期的商户；关键词同时命中商户名/编号与门店名/城市/地址。
   */
  async list(query: PageQueryDto): Promise<PageResult<ClientStoreListItem>> {
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const keyword = query.keyword?.trim();
    const pattern = keyword ? likePattern(keyword) : '';

    let extras: FindOptionsWhere<Merchant>[] = [{}];
    if (keyword) {
      const storesMatched = await this.stores.find({
        where: [
          { name: Like(pattern) },
          { city: Like(pattern) },
          { address: Like(pattern) },
        ],
        select: { merchantId: true },
      });
      const merchantIds = storesMatched.map((store) => store.merchantId);
      extras = [
        { name: Like(pattern) },
        { code: Like(pattern) },
        ...(merchantIds.length ? [{ id: In(merchantIds) }] : []),
      ];
    }

    const [merchants, total] = await this.merchants.findAndCount({
      where: this.usableQuery(extras),
      order: { id: 'ASC' },
      skip,
      take,
    });

    const stores = merchants.length
      ? await this.stores.find({
          where: { merchantId: In(merchants.map((merchant) => merchant.id)) },
        })
      : [];
    const storeByMerchant = new Map(stores.map((store) => [store.merchantId, store] as const));

    const list: ClientStoreListItem[] = merchants
      .filter((merchant) => storeByMerchant.has(merchant.id))
      .map((merchant) => ({
        ...this.toView(merchant, storeByMerchant.get(merchant.id)!),
        distanceText: null,
      }));

    return buildPageResult(list, total, query.page, query.pageSize);
  }

  /**
   * 「营业中且未到期」= 状态 active × (永不到期 | 到期时间在未来)。
   * find 的 where 数组是 OR 语义，而到期时间需要两个分支，因此这里做笛卡尔展开。
   */
  private usableQuery(extras: FindOptionsWhere<Merchant>[]): FindOptionsWhere<Merchant>[] {
    const now = new Date();
    return extras.flatMap((extra) => [
      { ...extra, status: MerchantStatus.Active, expireAt: IsNull() },
      { ...extra, status: MerchantStatus.Active, expireAt: MoreThan(now) },
    ]);
  }

  /** 令牌里只有 merchantId，恢复会话时按 ID 反查「商户 + 门店」。 */
  async resolveById(merchantId: number): Promise<{ merchant: Merchant; store: Store }> {
    const merchant = await this.merchants.findOne({ where: { id: merchantId } });
    if (!merchant) {
      throw new NotFoundException('门店不存在，请重新扫码');
    }
    const store = await this.stores.findOne({ where: { merchantId } });
    if (!store) {
      throw new NotFoundException('该门店尚未完成配置');
    }
    return { merchant, store };
  }

  /** 纯映射：门店列表、进店上下文、登录响应共用同一份字段结构，避免三处漂移。 */
  toView(merchant: Merchant, store: Store): ClientStoreView {
    return {
      merchantCode: merchant.code,
      merchantName: merchant.name,
      name: store.name,
      logo: store.logo,
      province: store.province,
      city: store.city,
      district: store.district,
      address: store.address,
      phone: store.phone,
      notice: store.notice,
      businessHours: store.businessHours ?? [],
      status: store.status,
      openNow: store.status === StoreStatus.Open,
      dineTypes: [...DINE_TYPE_OPTIONS],
    };
  }
}
