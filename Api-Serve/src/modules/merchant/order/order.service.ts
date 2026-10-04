import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  type EntityManager,
  In,
  Like,
  LessThanOrEqual,
  MoreThanOrEqual,
  type FindOptionsWhere,
  type Repository,
} from 'typeorm';
import { OrderStatus, PayStatus } from '../../../common/constants/dict';
import { buildPageResult, type PageResult } from '../../../common/dto/page-result.dto';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { likePattern } from '../../../common/utils/like.util';
import { Dish } from '../../../database/entities/dish.entity';
import { Member } from '../../../database/entities/member.entity';
import { MemberGrowthService } from '../../member-growth/member-growth.service';
// 值导入：Nest 需要在启动时解析 PrintService 这一构造函数依赖，
// 用 `import type` 编译能过，但启动时会报 can't resolve dependency。
import { PrintService } from '../print/print.service';
import { Order } from '../../../database/entities/order.entity';
import { OrderItem } from '../../../database/entities/order-item.entity';
import {
  type OrderBrief,
  type OrderDetail,
  type OrderQueryDto,
  type OrderSummary,
  type UpdateOrderStatusDto,
} from './dto/order.dto';

/** 订单状态机：只允许沿流转顺序推进，或取消/退款。 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatus.Pending]: [OrderStatus.Accepted, OrderStatus.Cancelled],
  [OrderStatus.Accepted]: [OrderStatus.Preparing, OrderStatus.Cancelled],
  [OrderStatus.Preparing]: [OrderStatus.Ready, OrderStatus.Cancelled],
  [OrderStatus.Ready]: [OrderStatus.Completed, OrderStatus.Cancelled],
  [OrderStatus.Completed]: [OrderStatus.Refunded],
  [OrderStatus.Cancelled]: [],
  [OrderStatus.Refunded]: [],
};

const TERMINAL_STATUSES: readonly OrderStatus[] = [OrderStatus.Cancelled, OrderStatus.Refunded];

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  private readonly orders: TenantRepo<Order>;
  private readonly items: TenantRepo<OrderItem>;
  private readonly dishes: TenantRepo<Dish>;
  private readonly members: TenantRepo<Member>;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Order) orderRepository: Repository<Order>,
    @InjectRepository(OrderItem) itemRepository: Repository<OrderItem>,
    @InjectRepository(Dish) dishRepository: Repository<Dish>,
    @InjectRepository(Member) memberRepository: Repository<Member>,
    private readonly growth: MemberGrowthService,
    private readonly print: PrintService,
  ) {
    this.orders = new TenantRepo(orderRepository);
    this.items = new TenantRepo(itemRepository);
    this.dishes = new TenantRepo(dishRepository);
    this.members = new TenantRepo(memberRepository);
  }

  async page(merchantId: number, query: OrderQueryDto): Promise<PageResult<OrderBrief>> {
    const base: FindOptionsWhere<Order> = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.dineType ? { dineType: query.dineType } : {}),
      ...this.dateRange(query),
    };

    const keyword = query.keyword?.trim();
    const where: FindOptionsWhere<Order> | FindOptionsWhere<Order>[] = keyword
      ? [
          { ...base, orderNo: Like(likePattern(keyword)) },
          { ...base, pickupCode: Like(likePattern(keyword)) },
          { ...base, memberNickname: Like(likePattern(keyword)) },
        ]
      : base;

    const result = await this.orders.page(merchantId, query, {
      where,
      relations: { items: true },
      order: { id: 'DESC' },
    });

    return { ...result, list: result.list.map((order) => this.toBrief(order)) };
  }

  async detail(merchantId: number, id: number): Promise<OrderDetail> {
    const order = await this.orders.findById(merchantId, id, {
      relations: { items: true },
    });
    return { ...this.toBrief(order), items: order.items ?? [] };
  }

  async updateStatus(
    merchantId: number,
    id: number,
    dto: UpdateOrderStatusDto,
  ): Promise<OrderDetail> {
    const order = await this.orders.findById(merchantId, id, {
      relations: { items: true },
    });

    if (!ALLOWED_TRANSITIONS[order.status].includes(dto.status)) {
      throw BusinessException.badRequest(
        `订单当前状态不允许变更为 ${dto.status}`,
      );
    }

    const updated = await this.dataSource.transaction(async (manager) => {
      const orders = new TenantRepo(manager.getRepository(Order));
      const patch: Partial<Order> = { status: dto.status };

      if (dto.status === OrderStatus.Accepted) {
        patch.acceptedAt = new Date();
      } else if (dto.status === OrderStatus.Ready) {
        patch.readyAt = new Date();
      } else if (dto.status === OrderStatus.Completed) {
        patch.completedAt = new Date();
      } else if (dto.status === OrderStatus.Cancelled) {
        patch.cancelledAt = new Date();
        patch.cancelReason = dto.remark ?? null;
      } else if (dto.status === OrderStatus.Refunded) {
        patch.cancelledAt = new Date();
        patch.cancelReason = dto.remark ?? null;
      }
      if (dto.remark && dto.status !== OrderStatus.Cancelled && dto.status !== OrderStatus.Refunded) {
        patch.handleRemark = dto.remark;
      }

      const saved = await orders.update(merchantId, id, patch);
      if (dto.status === OrderStatus.Completed) {
        await this.applyCompletionStats(manager, merchantId, saved);
      }
      return saved;
    });

    // 自动打印放在事务之外：出纸是硬件动作，打不出来不能把订单流转一起回滚。
    // PrintService 内部已吞掉「未开启自动打印 / 没配打印机」两种情况。
    await this.triggerAutoPrint(merchantId, id, dto.status);

    return { ...this.toBrief(updated), items: updated.items ?? [] };
  }

  /**
   * 按门店配置的出票时机触发自动打印。
   *
   * 任何异常都只记日志不抛出：订单已经流转成功了，
   * 因为打印机没插电就让接口报错，收银台会以为订单没接上而重复操作。
   */
  private async triggerAutoPrint(
    merchantId: number,
    orderId: number,
    status: OrderStatus,
  ): Promise<void> {
    const on = status === OrderStatus.Accepted
      ? OrderStatus.Accepted
      : status === OrderStatus.Ready
        ? OrderStatus.Ready
        : null;
    if (!on) {
      return;
    }
    try {
      await this.print.autoPrintForOrder(merchantId, orderId, on);
    } catch (error) {
      this.logger.warn(
        `订单 ${orderId} 自动打印失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** 完成订单时累计菜品销量与会员消费数据，保证看板与会员画像有真实来源。 */
  private async applyCompletionStats(
    manager: EntityManager,
    merchantId: number,
    order: Order,
  ): Promise<void> {
    const items = await manager.getRepository(OrderItem).find({ where: { merchantId, orderId: order.id } });
    const dishIds = [...new Set(items.map((item) => item.dishId).filter((id): id is number => id !== null))];

    if (dishIds.length > 0) {
      const dishes = new TenantRepo(manager.getRepository(Dish));
      const related = await dishes.list(merchantId, { where: { id: In(dishIds) } });
      for (const dish of related) {
        dish.salesCount += items
          .filter((item) => item.dishId === dish.id)
          .reduce((sum, item) => sum + item.quantity, 0);
      }
      await manager.getRepository(Dish).save(related);
    }

    if (order.memberId !== null) {
      const members = new TenantRepo(manager.getRepository(Member));
      const member = await members.findBy(merchantId, { id: order.memberId });
      if (member) {
        member.orderCount += 1;
        member.totalAmount = Number((member.totalAmount + order.payAmount).toFixed(2));
        member.points += Math.floor(order.payAmount);
        member.lastOrderAt = new Date();
        await manager.getRepository(Member).save(member);
        // 成长值走 GrowthModule 唯一写入口：会员日翻倍与达成型任务奖励只在那一处判断。
        // 必须把 manager 传进去——同一行 member 已被本事务锁住，
        // 让成长域改用池连接去写就是两个连接抢一把锁，只会等到锁超时。
        await this.growth.creditOrderCompletion(order, member, manager);
      }
    }
  }

  async summary(merchantId: number, query: OrderQueryDto): Promise<OrderSummary> {
    const range = this.dateRange(query);
    const orders = await this.orders.list(merchantId, {
      where: range,
      select: { id: true, status: true, payStatus: true, payAmount: true },
    });

    let turnover = 0;
    let pendingCount = 0;
    let completedCount = 0;
    let cancelledCount = 0;
    let unpaidCount = 0;

    for (const order of orders) {
      if (!TERMINAL_STATUSES.includes(order.status)) {
        turnover += order.payAmount;
      }
      // 待收款只看「还活着且没收到钱」的单：取消/退款的单不该再催收银员去收款
      if (order.payStatus === PayStatus.Unpaid && !TERMINAL_STATUSES.includes(order.status)) {
        unpaidCount += 1;
      }
      if (order.status === OrderStatus.Pending) {
        pendingCount += 1;
      } else if (order.status === OrderStatus.Completed) {
        completedCount += 1;
      } else if (
        order.status === OrderStatus.Cancelled ||
        order.status === OrderStatus.Refunded
      ) {
        cancelledCount += 1;
      }
    }

    return {
      orderCount: orders.length,
      turnover: Number(turnover.toFixed(2)),
      pendingCount,
      completedCount,
      cancelledCount,
      unpaidCount,
    };
  }

  private dateRange(query: OrderQueryDto): FindOptionsWhere<Order> {
    if (query.from && query.to) {
      return {
        createdAt: Between(this.startOfDay(query.from), this.endOfDay(query.to)),
      };
    }
    if (query.from) {
      return { createdAt: MoreThanOrEqual(this.startOfDay(query.from)) };
    }
    if (query.to) {
      return { createdAt: LessThanOrEqual(this.endOfDay(query.to)) };
    }
    return {};
  }

  private startOfDay(date: string): Date {
    return new Date(`${date}T00:00:00`);
  }

  private endOfDay(date: string): Date {
    return new Date(`${date}T23:59:59`);
  }

  /** 列表已 JOIN 出明细，直接带出去：平台端与商家端都能一眼看到点了什么菜。 */
  private toBrief(order: Order): OrderBrief {
    const items = order.items ?? [];
    const { member, ...rest } = order;
    return { ...rest, items, itemCount: items.length };
  }
}
