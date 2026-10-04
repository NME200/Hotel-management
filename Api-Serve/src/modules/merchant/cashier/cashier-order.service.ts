import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, type Repository } from 'typeorm';
import {
  AccountStatus,
  DINE_TYPE_LABELS,
  DineType,
  OrderStatus,
  PayStatus,
  TableDiningStatus,
} from '../../../common/constants/dict';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { generateOrderNo } from '../../../common/utils/id.util';
import { toYuan } from '../../../common/utils/money.util';
import { Member } from '../../../database/entities/member.entity';
import { Order } from '../../../database/entities/order.entity';
import { OrderItem } from '../../../database/entities/order-item.entity';
import { StoreTable } from '../../../database/entities/store-table.entity';
import { ClientOrderPriceService, type PricedOrder } from '../../client/order/client-order-price.service';
import { deductStock } from '../../client/order/order-stock.util';
import type { CreateCashierOrderDto } from './dto/cashier.dto';
import type {
  CashierOrderLine,
  CashierOrderView,
  CashierPreviewView,
} from './models/cashier.model';

/**
 * 收银台线下点餐。
 *
 * 与顾客自助下单的关系：**算价共用一份**（`ClientOrderPriceService`），
 * 所以会员价、活动价取低、打包费与配送费的口径完全一致，
 * 收银台报出的价与小程序里的价不可能对不上。差异只在入口语义上：
 *
 * | | 顾客自助 | 收银台 |
 * | --- | --- | --- |
 * | 顾客身份 | 必须有会员档案 | 可散客（`memberId` 为空） |
 * | 桌号来源 | 扫桌位码拿 token | 选桌位 ID |
 * | 优惠券 | 支持 | 不支持（线下核销走人工） |
 * | 初始状态 | `pending` 等商家接单 | `accepted` —— 收银员开单即等于商家接单 |
 *
 * 「开单即接单」是有意的：收银员就是商家本人，让他再点一次「接单」只是仪式。
 * 但支付状态仍然是独立的 `unpaid`，收款成功才由支付域改成 `paid`。
 */
@Injectable()
export class CashierOrderService {
  private readonly logger = new Logger(CashierOrderService.name);
  private readonly orders: TenantRepo<Order>;
  private readonly items: TenantRepo<OrderItem>;
  private readonly members: TenantRepo<Member>;
  private readonly tables: TenantRepo<StoreTable>;

  constructor(
    @InjectRepository(Order) orderRepository: Repository<Order>,
    @InjectRepository(OrderItem) itemRepository: Repository<OrderItem>,
    @InjectRepository(Member) memberRepository: Repository<Member>,
    @InjectRepository(StoreTable) tableRepository: Repository<StoreTable>,
    private readonly dataSource: DataSource,
    private readonly pricing: ClientOrderPriceService,
  ) {
    this.orders = new TenantRepo(orderRepository);
    this.items = new TenantRepo(itemRepository);
    this.members = new TenantRepo(memberRepository);
    this.tables = new TenantRepo(tableRepository);
  }

  /**
   * 下单前算价：与建单走同一个算价服务，所以「收银员报的价」就是「落库的价」。
   *
   * 不落库、不扣库存 —— 顾客可能看完价格就走，不该留下垃圾订单；
   * 但价格必须是权威的，所以仍然走后端算而不是前端估算。
   */
  async preview(merchantId: number, dto: CreateCashierOrderDto): Promise<CashierPreviewView> {
    const priced = await this.pricing.price(
      merchantId,
      dto.memberId ?? null,
      dto.dineType,
      dto.items,
    );
    return {
      lines: priced.lines.map((line) => ({
        dishName: line.dishName,
        specDesc: line.specDesc,
        quantity: line.quantity,
        unitPrice: toYuan(line.unitPriceCents),
        totalAmount: toYuan(line.totalCents),
      })),
      dishAmount: toYuan(priced.dishAmountCents),
      packingAmount: toYuan(priced.packingAmountCents),
      deliveryAmount: toYuan(priced.deliveryAmountCents),
      discountAmount: toYuan(priced.discountCents),
      payAmount: toYuan(priced.payAmountCents),
      memberPriced: priced.lines.some((line) => line.memberPriced),
      promotionPriced: priced.lines.some((line) => line.promotionPriced),
    };
  }

  async create(
    merchantId: number,
    dto: CreateCashierOrderDto,
    operator: { id: number; name: string },
  ): Promise<CashierOrderView> {
    const tableNo = await this.resolveTableNo(merchantId, dto);
    const memberNickname = dto.memberId
      ? await this.memberNickname(merchantId, dto.memberId)
      : '散客';
    const priced = await this.pricing.price(
      merchantId,
      dto.memberId ?? null,
      dto.dineType,
      dto.items,
    );

    const order = await this.dataSource.transaction(async (manager) => {
      const saved = await this.persistOrder(
        manager,
        merchantId,
        dto,
        priced,
        tableNo,
        memberNickname,
      );
      await new TenantRepo(manager.getRepository(OrderItem)).createMany(
        merchantId,
        priced.lines.map((line) => ({
          orderId: saved.id,
          dishId: line.dishId,
          dishName: line.dishName,
          dishImage: line.dishImage,
          skuId: line.skuId,
          specDesc: line.specDesc || null,
          unitPrice: toYuan(line.unitPriceCents),
          quantity: line.quantity,
          totalAmount: toYuan(line.totalCents),
          remark: null,
        })),
      );
      await deductStock(manager, merchantId, priced.stockPlan);
      return saved;
    });

    this.logger.log(
      `收银台下单 orderNo=${order.orderNo} merchantId=${merchantId} 操作人=${operator.name} payCents=${priced.payAmountCents}`,
    );
    return this.toView(order, await this.itemsOf(order.id));
  }

  /**
   * 堂食必须有桌位，并顺手把空闲的桌位开台。
   *
   * 自动开台是为了让看板可信：收银员直接点菜下单时往往不会先点「开台」，
   * 如果这里不补上，看板上就会出现「有订单但桌位空闲」的假象。
   */
  private async resolveTableNo(
    merchantId: number,
    dto: CreateCashierOrderDto,
  ): Promise<string | null> {
    if (dto.dineType !== DineType.DineIn) {
      return null;
    }
    if (!dto.tableId) {
      throw BusinessException.badRequest('堂食请先选择桌位');
    }

    const table = await this.tables.findById(merchantId, dto.tableId);
    if (table.status !== AccountStatus.Active) {
      throw BusinessException.badRequest(`「${table.tableNo}」已停用，无法下单`);
    }
    if (table.diningStatus !== TableDiningStatus.Dining) {
      await this.tables.update(merchantId, table.id, {
        diningStatus: TableDiningStatus.Dining,
        guestCount: dto.peopleCount ?? null,
        openedAt: new Date(),
      });
    }
    return table.tableNo;
  }

  /** 订单上快照顾客昵称；散客没有档案，用「散客」占位，小票上才不至于空白。 */
  private async memberNickname(merchantId: number, memberId: number): Promise<string> {
    const member = await this.members.findById(merchantId, memberId, {
      relations: { customer: true },
    });
    return member.customer.nickname;
  }

  private async persistOrder(
    manager: EntityManager,
    merchantId: number,
    dto: CreateCashierOrderDto,
    priced: PricedOrder,
    tableNo: string | null,
    memberNickname: string,
  ): Promise<Order> {
    const orders = new TenantRepo(manager.getRepository(Order));
    const created = new Date();

    return orders.create(merchantId, {
      orderNo: await this.uniqueOrderNo(merchantId, created),
      // 取餐码在收款成功时才发（见 PaymentService.markOrderPaid），
      // 线下点餐同样如此：没付钱的单不该占号。
      memberId: dto.memberId ?? null,
      memberNickname,
      dineType: dto.dineType,
      status: OrderStatus.Accepted,
      acceptedAt: created,
      tableNo,
      peopleCount: dto.peopleCount ?? 1,
      dishAmount: toYuan(priced.dishAmountCents),
      packingAmount: toYuan(priced.packingAmountCents),
      deliveryAmount: toYuan(priced.deliveryAmountCents),
      discountAmount: toYuan(priced.discountCents),
      payAmount: toYuan(priced.payAmountCents),
      payStatus: PayStatus.Unpaid,
      remark: dto.remark ?? null,
      createdAt: created,
    });
  }

  private async uniqueOrderNo(merchantId: number, created: Date): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const orderNo = generateOrderNo(created);
      const exists = await this.dataSource.getRepository(Order).exists({ where: { orderNo } });
      if (!exists) {
        return orderNo;
      }
    }
    throw BusinessException.conflict('下单过于频繁，请稍后重试');
  }

  private async itemsOf(orderId: number): Promise<OrderItem[]> {
    return this.dataSource
      .getRepository(OrderItem)
      .find({ where: { orderId }, order: { id: 'ASC' } });
  }

  private toView(order: Order, items: OrderItem[]): CashierOrderView {
    const lines: CashierOrderLine[] = items.map((item) => ({
      dishName: item.dishName,
      specDesc: item.specDesc ?? '',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalAmount: item.totalAmount,
    }));

    return {
      id: order.id,
      orderNo: order.orderNo,
      dineType: order.dineType,
      dineTypeLabel: DINE_TYPE_LABELS[order.dineType],
      tableNo: order.tableNo,
      peopleCount: order.peopleCount,
      memberId: order.memberId,
      memberNickname: order.memberNickname,
      dishAmount: order.dishAmount,
      packingAmount: order.packingAmount,
      deliveryAmount: order.deliveryAmount,
      discountAmount: order.discountAmount,
      payAmount: order.payAmount,
      payStatus: order.payStatus,
      status: order.status,
      items: lines,
    };
  }
}
