import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, LessThan, type Repository } from 'typeorm';
import { CacheKey, CacheTtl } from '../../../common/constants/cache-key';
import { MerchantStatus, OrderStatus } from '../../../common/constants/dict';
import { addDays, endOfDay, formatDateKey, startOfDay } from '../../../common/utils/date.util';
import { Dish } from '../../../database/entities/dish.entity';
import { Member } from '../../../database/entities/member.entity';
import { Merchant } from '../../../database/entities/merchant.entity';
import { Order } from '../../../database/entities/order.entity';
import { RedisService } from '../../redis/redis.service';
import type {
  PlatformOverview,
  PlatformTopMerchant,
  PlatformTrendPoint,
} from './models/platform-overview.model';

const TREND_DAYS = 7;
const TOP_MERCHANT_LIMIT = 5;
const EXPIRY_WARNING_DAYS = 30;
const CLOSED_STATUSES: readonly OrderStatus[] = [OrderStatus.Cancelled, OrderStatus.Refunded];

function isBillable(status: OrderStatus): boolean {
  return !CLOSED_STATUSES.includes(status);
}

@Injectable()
export class PlatformDashboardService {
  constructor(
    @InjectRepository(Merchant) private readonly merchants: Repository<Merchant>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Dish) private readonly dishes: Repository<Dish>,
    @InjectRepository(Member) private readonly members: Repository<Member>,
    private readonly redis: RedisService,
  ) {}

  /** 跨租户聚合代价较高，缓存 60 秒，平台看板刷新频率足够。 */
  async overview(): Promise<PlatformOverview> {
    const key = CacheKey.platformDashboard();
    const cached = await this.redis.getJson<PlatformOverview>(key);
    if (cached) {
      return cached;
    }

    const overview = await this.buildOverview();
    await this.redis.setJson(key, overview, CacheTtl.platformDashboard);
    return overview;
  }

  private async buildOverview(): Promise<PlatformOverview> {
    const now = new Date();
    const todayKey = formatDateKey(now);
    const yesterdayKey = formatDateKey(addDays(now, -1));
    const rangeStart = startOfDay(addDays(now, -(TREND_DAYS - 1)));
    const rangeEnd = endOfDay(now);

    const [
      merchantTotal,
      merchantActive,
      merchantPendingAudit,
      expiringSoon,
      alreadyExpired,
      orderTotal,
      dishTotal,
      memberTotal,
      recentOrders,
    ] = await Promise.all([
      this.merchants.count(),
      this.merchants.count({ where: { status: MerchantStatus.Active } }),
      this.merchants.count({ where: { status: MerchantStatus.PendingAudit } }),
      this.merchants.count({
        where: {
          status: MerchantStatus.Active,
          expireAt: Between(now, addDays(now, EXPIRY_WARNING_DAYS)),
        },
      }),
      this.merchants.count({
        where: { status: MerchantStatus.Active, expireAt: LessThan(now) },
      }),
      this.orders.count(),
      this.dishes.count(),
      this.members.count(),
      this.orders.find({
        where: { createdAt: Between(rangeStart, rangeEnd) },
        select: { id: true, merchantId: true, status: true, payAmount: true, createdAt: true },
        order: { createdAt: 'ASC' },
      }),
    ]);

    const trendMap = new Map<string, PlatformTrendPoint>();
    for (let offset = 0; offset < TREND_DAYS; offset += 1) {
      const date = formatDateKey(addDays(rangeStart, offset));
      trendMap.set(date, { date, orderCount: 0, turnover: 0 });
    }

    const perMerchant = new Map<number, PlatformTopMerchant>();
    let todayOrderCount = 0;
    let todayTurnover = 0;
    let yesterdayTurnover = 0;

    for (const order of recentOrders) {
      const date = formatDateKey(order.createdAt);
      const point = trendMap.get(date);
      if (!point) {
        continue;
      }

      point.orderCount += 1;
      const merchantPoint = perMerchant.get(order.merchantId) ?? {
        merchantId: order.merchantId,
        merchantName: '',
        orderCount: 0,
        turnover: 0,
      };
      merchantPoint.orderCount += 1;

      if (isBillable(order.status)) {
        point.turnover = Number((point.turnover + order.payAmount).toFixed(2));
        merchantPoint.turnover = Number((merchantPoint.turnover + order.payAmount).toFixed(2));

        if (date === todayKey) {
          todayTurnover += order.payAmount;
        } else if (date === yesterdayKey) {
          yesterdayTurnover += order.payAmount;
        }
      }
      if (date === todayKey) {
        todayOrderCount += 1;
      }
      perMerchant.set(order.merchantId, merchantPoint);
    }

    const topMerchants = await this.fillMerchantNames(
      [...perMerchant.values()]
        .sort((a, b) => b.turnover - a.turnover || b.orderCount - a.orderCount)
        .slice(0, TOP_MERCHANT_LIMIT),
    );

    return {
      merchantTotal,
      merchantActive,
      merchantPendingAudit,
      expiringCount: expiringSoon + alreadyExpired,
      orderTotal,
      dishTotal,
      memberTotal,
      todayOrderCount,
      todayTurnover: Number(todayTurnover.toFixed(2)),
      yesterdayTurnover: Number(yesterdayTurnover.toFixed(2)),
      orderTrend: [...trendMap.values()],
      topMerchants,
    };
  }

  private async fillMerchantNames(
    rows: PlatformTopMerchant[],
  ): Promise<PlatformTopMerchant[]> {
    if (rows.length === 0) {
      return [];
    }
    const merchants = await this.merchants.find({
      where: { id: In(rows.map((row) => row.merchantId)) },
      select: { id: true, name: true },
    });
    const names = new Map(merchants.map((merchant) => [merchant.id, merchant.name] as const));

    return rows.map((row) => ({ ...row, merchantName: names.get(row.merchantId) ?? '-' }));
  }
}
