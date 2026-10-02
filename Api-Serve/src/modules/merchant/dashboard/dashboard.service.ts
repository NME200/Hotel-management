import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, type Repository } from 'typeorm';
import { CacheKey, CacheTtl } from '../../../common/constants/cache-key';
import { AccountStatus, DishStatus, OrderStatus } from '../../../common/constants/dict';
import { addDays, endOfDay, formatDateKey, startOfDay } from '../../../common/utils/date.util';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { Dish } from '../../../database/entities/dish.entity';
import { Member } from '../../../database/entities/member.entity';
import { Order } from '../../../database/entities/order.entity';
import { RedisService } from '../../redis/redis.service';
import type { DashboardOverview, HotDish, TrendPoint } from './models/dashboard.model';

const TREND_DAYS = 7;
const HOT_DISH_LIMIT = 5;
const CLOSED_STATUSES: readonly OrderStatus[] = [OrderStatus.Cancelled, OrderStatus.Refunded];

@Injectable()
export class DashboardService {
  private readonly orders: TenantRepo<Order>;
  private readonly dishes: TenantRepo<Dish>;
  private readonly members: TenantRepo<Member>;

  constructor(
    @InjectRepository(Order) orderRepository: Repository<Order>,
    @InjectRepository(Dish) dishRepository: Repository<Dish>,
    @InjectRepository(Member) memberRepository: Repository<Member>,
    private readonly redis: RedisService,
  ) {
    this.orders = new TenantRepo(orderRepository);
    this.dishes = new TenantRepo(dishRepository);
    this.members = new TenantRepo(memberRepository);
  }

  /** 看板结果缓存 60 秒，避免商户停留在页面时反复扫描近 7 天订单。 */
  async overview(merchantId: number): Promise<DashboardOverview> {
    const key = CacheKey.dashboard(merchantId);
    const cached = await this.redis.getJson<DashboardOverview>(key);
    if (cached) {
      return cached;
    }

    const overview = await this.buildOverview(merchantId);
    await this.redis.setJson(key, overview, CacheTtl.dashboard);
    return overview;
  }

  private async buildOverview(merchantId: number): Promise<DashboardOverview> {
    const now = new Date();
    const todayKey = formatDateKey(now);
    const rangeStart = startOfDay(addDays(now, -(TREND_DAYS - 1)));
    const rangeEnd = endOfDay(now);

    const orders = await this.orders.list(merchantId, {
      where: { createdAt: Between(rangeStart, rangeEnd) },
      select: { id: true, status: true, payAmount: true, createdAt: true },
      order: { createdAt: 'ASC' },
    });

    const trendMap = new Map<string, TrendPoint>();
    for (let offset = 0; offset < TREND_DAYS; offset += 1) {
      const key = formatDateKey(addDays(rangeStart, offset));
      trendMap.set(key, { date: key, orderCount: 0, turnover: 0 });
    }

    let todayOrderCount = 0;
    let todayTurnover = 0;

    for (const order of orders) {
      const key = formatDateKey(order.createdAt);
      const point = trendMap.get(key);
      if (!point) {
        continue;
      }
      point.orderCount += 1;
      const closed = CLOSED_STATUSES.includes(order.status);
      if (!closed) {
        point.turnover = Number((point.turnover + order.payAmount).toFixed(2));
        if (key === todayKey) {
          todayTurnover += order.payAmount;
        }
      }
      if (key === todayKey) {
        todayOrderCount += 1;
      }
    }

    const [pendingOrderCount, dishCount, memberCount, hotDishRows] = await Promise.all([
      this.orders.count(merchantId, { status: OrderStatus.Pending }),
      this.dishes.count(merchantId, { status: DishStatus.OnSale }),
      this.members.count(merchantId, { status: AccountStatus.Active }),
      this.dishes.list(merchantId, {
        where: { status: DishStatus.OnSale },
        order: { salesCount: 'DESC', id: 'DESC' },
        select: { id: true, name: true, salesCount: true },
        take: HOT_DISH_LIMIT,
      }),
    ]);

    const hotDishes: HotDish[] = hotDishRows.map((dish) => ({
      id: dish.id,
      name: dish.name,
      salesCount: dish.salesCount,
    }));

    return {
      todayOrderCount,
      todayTurnover: Number(todayTurnover.toFixed(2)),
      pendingOrderCount,
      dishCount,
      memberCount,
      orderTrend: [...trendMap.values()],
      hotDishes,
    };
  }
}
