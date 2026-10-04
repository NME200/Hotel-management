import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  In,
  Repository,
  type EntityManager,
} from 'typeorm';
import {
  AccountStatus,
  DINE_TYPE_LABELS,
  DineType,
  ORDER_STATUS_LABELS,
  OrderStatus,
  PAY_STATUS_LABELS,
  PayStatus,
  StoreStatus,
} from '../../../common/constants/dict';
import type { PageResult } from '../../../common/dto/page-result.dto';
import { buildPageResult } from '../../../common/dto/page-result.dto';
import { toSkipTake } from '../../../common/dto/page-query.dto';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { generateOrderNo } from '../../../common/utils/id.util';
import { toYuan } from '../../../common/utils/money.util';
import { Dish } from '../../../database/entities/dish.entity';
import { DishSku } from '../../../database/entities/dish-sku.entity';
import { Member } from '../../../database/entities/member.entity';
import { Merchant } from '../../../database/entities/merchant.entity';
import { Order } from '../../../database/entities/order.entity';
import { OrderItem } from '../../../database/entities/order-item.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { StoreTable } from '../../../database/entities/store-table.entity';
import { OPEN_PAYMENT_STATUSES } from '../../payment/constants/payment.constant';
import { MemberGrowthService } from '../../member-growth/member-growth.service';
import { ClientMemberResolver } from '../auth/client-member.resolver';
import { ClientCouponService } from '../coupon/client-coupon.service';
import { ESTIMATE_PREPARE_MINUTES } from '../constants/client.constant';
import type {
  CancelClientOrderDto,
  ClientCheckoutPreviewDto,
  ClientOrderQueryDto,
  CreateClientOrderDto,
} from '../dto/client-order.dto';
import type {
  ClientCheckoutLine,
  ClientCheckoutView,
  ClientOrderBriefView,
  ClientOrderTraceView,
  OrderEstimate,
  OrderTraceStep,
} from '../models/client-order.model';
import { ClientOrderPriceService, type PricedOrder, type StockPlan } from './client-order-price.service';
import { deductStock } from './order-stock.util';
import { ClientStoreService } from '../store/client-store.service';

/** 跟踪页四步：已下单 → 商家接单 → 出餐中 → 已完成。 */
const TRACE_STEPS: readonly { code: string; label: string; desc: string }[] = [
  { code: 'placed', label: '已下单', desc: '订单已送达商家' },
  { code: 'accepted', label: '商家接单', desc: '商家已确认订单' },
  { code: 'preparing', label: '出餐中', desc: '厨房正在制作' },
  { code: 'finished', label: '已完成', desc: '餐点已完成' },
];

@Injectable()
export class ClientOrderService {
  private readonly logger = new Logger(ClientOrderService.name);
  private readonly orders: TenantRepo<Order>;
  private readonly items: TenantRepo<OrderItem>;
  private readonly members: TenantRepo<Member>;

  constructor(
    @InjectRepository(Order) orderRepository: Repository<Order>,
    @InjectRepository(OrderItem) itemRepository: Repository<OrderItem>,
    @InjectRepository(Member) memberRepository: Repository<Member>,
    @InjectRepository(StoreTable) private readonly tables: Repository<StoreTable>,
    private readonly dataSource: DataSource,
    private readonly profiles: ClientMemberResolver,
    private readonly pricing: ClientOrderPriceService,
    private readonly coupons: ClientCouponService,
    private readonly stores: ClientStoreService,
    private readonly growth: MemberGrowthService,
  ) {
    this.orders = new TenantRepo(orderRepository);
    this.items = new TenantRepo(itemRepository);
    this.members = new TenantRepo(memberRepository);
  }

  /* ------------------------------ 结算 ------------------------------ */

  async checkout(
    merchantId: number,
    memberId: number,
    dto: ClientCheckoutPreviewDto,
  ): Promise<ClientCheckoutView> {
    const { store } = await this.stores.resolveById(merchantId);
    const priced = await this.pricing.price(
      merchantId,
      memberId,
      dto.dineType,
      dto.items,
      dto.couponId,
    );
    const usableCoupons = await this.coupons.usableFor(merchantId, memberId, priced.lines.map(toCouponLine));

    const storeOpen = store.status === StoreStatus.Open;
    return {
      lines: priced.lines.map(toCheckoutLine),
      ...amountsOf(priced),
      usedCoupon: priced.coupon
        ? {
            id: priced.coupon.id,
            name: priced.coupon.name,
            discountAmount: toYuan(priced.discountCents),
          }
        : null,
      usableCoupons,
      storeOpen,
      storeClosedTip: storeOpen ? null : '门店休息中，暂不接单，可先选菜稍后再来',
      tips: tipsOf(priced),
    };
  }

  /* ------------------------------ 下单 ------------------------------ */

  async create(
    merchantId: number,
    memberId: number,
    dto: CreateClientOrderDto,
  ): Promise<ClientOrderTraceView> {
    const { store } = await this.stores.resolveById(merchantId);
    if (store.status !== StoreStatus.Open) {
      throw BusinessException.badRequest('门店休息中，暂时不能下单');
    }

    const priced = await this.pricing.price(
      merchantId,
      memberId,
      dto.dineType,
      dto.items,
      dto.couponId,
    );
    if (priced.payAmountCents <= 0) {
      // 零元单直接拒：支付域里没有"金额为 0 的支付单"这种形态，放行会留下一张付不掉的单
      throw BusinessException.badRequest('订单金额为 0，请联系门店处理');
    }

    const nickname = await this.customerNickname(merchantId, memberId);
    // 桌号只认 token 反查的结果，前端传来的任何桌号文本都进不来
    const tableNo = await this.resolveTableNo(merchantId, dto);
    const order = await this.dataSource.transaction(async (manager) => {
      const saved = await this.persistOrder(
        manager,
        merchantId,
        memberId,
        nickname,
        dto,
        priced,
        tableNo,
      );
      const orderItems = new TenantRepo(manager.getRepository(OrderItem));
      await orderItems.createMany(
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

      if (priced.coupon) {
        const used = await this.coupons.markUsed(
          manager,
          merchantId,
          priced.coupon.id,
          memberId,
          saved.id,
        );
        if (!used) {
          throw BusinessException.conflict('该优惠券刚刚已被使用，请重新选择');
        }
      }

      await this.deductStock(manager, merchantId, priced.stockPlan);
      return saved;
    });

    this.logger.log(
      `顾客下单成功 orderNo=${order.orderNo} merchantId=${merchantId} payCents=${priced.payAmountCents}`,
    );
    // 券在本单被核销，「首次用券」任务到这里才算真的达成。
    // 必须放在事务提交之后：事务里 member 行已被锁住，成长域再用池连接写它会等到锁超时，
    // 而此刻核销已落库，用它查到的已用券数判断里程碑正好准确。
    if (priced.coupon) {
      await this.growth.creditCouponUsed(merchantId, memberId);
    }
    return this.traceView(order, await this.itemsOf(order.id));
  }

  /* ------------------------------ 查询 ------------------------------ */

  async list(
    merchantId: number,
    memberId: number,
    query: ClientOrderQueryDto,
  ): Promise<PageResult<ClientOrderBriefView>> {
    // 租户条件与 memberId 一起交给 TenantRepo：会员 ID 只在商户内唯一，
    // 少了 merchantId 就能翻到别家店同名会员的订单。
    const result = await this.orders.page(merchantId, query, {
      where: { memberId, ...(query.status ? { status: query.status } : {}) },
      relations: { items: true },
      order: { id: 'DESC' },
    });

    return {
      ...result,
      list: result.list.map((order) => this.briefView(order, order.items ?? [])),
    };
  }

  /**
   * 跨门店「我的订单」：一个顾客账号在各家店的档案下的单混在一起，按下单时间倒序。
   *
   * 这里不能走 TenantRepo——它强制单租户条件，而这条查询本身就是跨租户的。
   * 安全边界换成归属校验：条件始终是 `member_id IN (当前顾客的档案)`，
   * 别人在任何一家店的单都查不出来。
   */
  async listAllStores(
    customerId: number,
    query: ClientOrderQueryDto,
  ): Promise<PageResult<ClientOrderBriefView>> {
    const profiles = await this.profiles.profilesOf(customerId);
    if (!profiles.length) {
      return buildPageResult([], 0, query.page, query.pageSize);
    }

    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [rows, total] = await this.dataSource.getRepository(Order).findAndCount({
      where: {
        memberId: In(profiles.map((item) => item.id)),
        ...(query.status ? { status: query.status } : {}),
      },
      relations: { items: true },
      order: { id: 'DESC' },
      skip,
      take,
    });

    const stores = await this.storeLabelsOf(rows.map((order) => order.merchantId));
    return buildPageResult(
      rows.map((order) => ({
        ...this.briefView(order, order.items ?? []),
        storeName: stores.names.get(order.merchantId) ?? null,
        storeCode: stores.codes.get(order.merchantId) ?? null,
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  /**
   * 订单详情与跟踪：按「这张单的会员档案属不属于当前顾客」放行，
   * 而不是按请求带的门店——顾客从跨店列表点进别家的单也要能看到出餐进度。
   */
  async detailByOwner(
    customerId: number,
    orderNo: string,
  ): Promise<ClientOrderTraceView> {
    const order = await this.ownedOrder(customerId, orderNo);
    return this.withStore(
      await this.traceView(order, await this.itemsOf(order.id)),
      order.merchantId,
    );
  }

  /* ------------------------------ 取消 ------------------------------ */

  /**
   * 顾客自助取消只限「未接单且未支付」。
   *
   * 一旦付过款，退款就必须走商家端的退款流程（涉及渠道与分账解冻），
   * 让顾客在小程序里点一下就退款，账迟早对不平。
   */
  async cancel(
    customerId: number,
    orderNo: string,
    dto: CancelClientOrderDto,
  ): Promise<ClientOrderTraceView> {
    const order = await this.ownedOrder(customerId, orderNo);
    const merchantId = order.merchantId;
    if (order.status !== OrderStatus.Pending) {
      throw BusinessException.badRequest('商家已接单，请联系门店取消');
    }
    if (order.payStatus !== PayStatus.Unpaid) {
      throw BusinessException.badRequest('订单已支付，请让门店发起退款');
    }

    const cancelled = await this.dataSource.transaction(async (manager) => {
      const orders = new TenantRepo(manager.getRepository(Order));
      const saved = await orders.update(merchantId, order.id, {
        status: OrderStatus.Cancelled,
        cancelledAt: new Date(),
        cancelReason: dto.reason?.trim() || '顾客主动取消',
      });
      // 券要放回顾客口袋，否则一次取消就吞掉一张券
      await this.coupons.releaseByOrder(manager, merchantId, order.id);
      await this.restoreStock(manager, merchantId, order.id);
      return saved;
    });

    return this.withStore(
      await this.traceView(cancelled, await this.itemsOf(cancelled.id)),
      merchantId,
    );
  }

  /* ------------------------------ 内部 ------------------------------ */

  /** 跨店读单时补上「这是哪家店的单」，顾客在全部订单里点进来的时候需要知道。 */
  private async withStore<T extends ClientOrderBriefView>(
    view: T,
    merchantId: number,
  ): Promise<T> {
    const stores = await this.storeLabelsOf([merchantId]);
    return {
      ...view,
      storeName: stores.names.get(merchantId) ?? null,
      storeCode: stores.codes.get(merchantId) ?? null,
    };
  }

  /** 按归属取单：orderNo 命中、且这条单的会员档案属于当前顾客。 */
  private async ownedOrder(customerId: number, orderNo: string): Promise<Order> {
    const profiles = await this.profiles.profilesOf(customerId);
    const order = profiles.length
      ? await this.dataSource.getRepository(Order).findOne({
          where: { orderNo, memberId: In(profiles.map((item) => item.id)) },
        })
      : null;
    if (!order) {
      throw BusinessException.notFound('订单不存在');
    }
    return order;
  }

  /** 批量取门店名与商户编号，供跨店列表标注每条单是哪家店的。 */
  private async storeLabelsOf(merchantIds: number[]): Promise<{
    names: Map<number, string>;
    codes: Map<number, string>;
  }> {
    const ids = [...new Set(merchantIds)];
    if (!ids.length) {
      return { names: new Map(), codes: new Map() };
    }
    const merchants = await this.dataSource.getRepository(Merchant).find({
      where: { id: In(ids) },
      select: { id: true, name: true, code: true },
    });
    return {
      names: new Map(merchants.map((item) => [item.id, item.name] as const)),
      codes: new Map(merchants.map((item) => [item.id, item.code] as const)),
    };
  }

  /**
   * 把桌位 token 换成桌号。堂食必须扫桌位码 —— 这是「只允许扫码堂食」的落点：
   * 后端不接受手填桌号，所以顾客拼不出一个不属于自己的桌号。
   *
   * 非堂食一律忽略 token：前端从堂食切到自取/外送时，本地可能还留着上一个桌位。
   */
  private async resolveTableNo(
    merchantId: number,
    dto: CreateClientOrderDto,
  ): Promise<string | null> {
    if (dto.dineType !== DineType.DineIn) {
      return null;
    }
    const token = dto.tableToken?.trim();
    if (!token) {
      throw BusinessException.badRequest('堂食需要扫描桌上的二维码，请扫码后重新下单');
    }

    const table = await this.tables.findOne({ where: { qrToken: token } });
    // 「不存在」与「不属于本店」合并成同一句提示：否则可以用 token 探测别家店有没有这张桌
    if (!table || table.merchantId !== merchantId) {
      throw BusinessException.badRequest('桌位二维码无效，请重新扫码');
    }
    if (table.status !== AccountStatus.Active) {
      throw BusinessException.badRequest('该桌位已停用，请联系店员');
    }
    return table.tableNo;
  }

  private async persistOrder(
    manager: EntityManager,
    merchantId: number,
    memberId: number,
    memberNickname: string,
    dto: CreateClientOrderDto,
    priced: PricedOrder,
    tableNo: string | null,
  ): Promise<Order> {
    const orders = new TenantRepo(manager.getRepository(Order));
    const created = new Date();
    const amounts = amountsOf(priced);

    return orders.create(merchantId, {
      orderNo: await this.uniqueOrderNo(merchantId, created),
      // 这里故意不发取餐码：下单只代表占了个坑，付款成功才进出品队列。
      // 提前发号会让未付款的单白占号，顾客也可能拿着失效的号去柜台等。
      memberId,
      memberNickname,
      dineType: dto.dineType,
      status: OrderStatus.Pending,
      tableNo,
      peopleCount: dto.peopleCount ?? 1,
      dishAmount: amounts.dishAmount,
      packingAmount: amounts.packingAmount,
      deliveryAmount: amounts.deliveryAmount,
      discountAmount: amounts.discountAmount,
      payAmount: amounts.payAmount,
      payStatus: PayStatus.Unpaid,
      remark: dto.remark ?? null,
      createdAt: created,
    });
  }

  /** 订单号全局唯一，重复概率极低但仍重试几次，撞号比下单失败好修。 */
  private async uniqueOrderNo(merchantId: number, created: Date): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const orderNo = generateOrderNo(created);
      const exists = await this.dataSource
        .getRepository(Order)
        .exists({ where: { orderNo } });
      if (!exists) {
        return orderNo;
      }
    }
    throw BusinessException.conflict('下单过于频繁，请稍后重试');
  }

  /** 订单上快照的是顾客昵称（身份在 customer 上，不在本店会员档案里）。 */
  private async customerNickname(merchantId: number, memberId: number): Promise<string> {
    const member = await this.members.findById(merchantId, memberId, {
      relations: { customer: true },
    });
    return member.customer.nickname;
  }

  private async itemsOf(orderId: number): Promise<OrderItem[]> {
    return this.dataSource
      .getRepository(OrderItem)
      .find({ where: { orderId }, order: { id: 'ASC' } });
  }

  private async deductStock(manager: EntityManager, merchantId: number, plan: StockPlan) {
    // 实现在 order-stock.util.ts：收银台线下点餐走的是同一个函数，避免第二份扣库存逻辑
    await deductStock(manager, merchantId, plan);
  }

  /** 取消订单要把库存还回去：与扣减同一份计划口径，从订单明细反推。 */
  private async restoreStock(manager: EntityManager, merchantId: number, orderId: number) {
    const items = await manager.getRepository(OrderItem).find({ where: { merchantId, orderId } });
    const dishPlan = new Map<number, number>();
    const skuPlan = new Map<number, number>();
    for (const item of items) {
      if (item.dishId !== null) {
        dishPlan.set(item.dishId, (dishPlan.get(item.dishId) ?? 0) + item.quantity);
      }
      if (item.skuId !== null) {
        skuPlan.set(item.skuId, (skuPlan.get(item.skuId) ?? 0) + item.quantity);
      }
    }

    const dishes = new TenantRepo(manager.getRepository(Dish));
    if (dishPlan.size) {
      const rows = await dishes.list(merchantId, { where: { id: In([...dishPlan.keys()]) } });
      for (const dish of rows) {
        if (dish.stock !== null) {
          dish.stock += dishPlan.get(dish.id) ?? 0;
        }
      }
      await manager.getRepository(Dish).save(rows);
    }

    const skus = new TenantRepo(manager.getRepository(DishSku));
    if (skuPlan.size) {
      const rows = await skus.list(merchantId, { where: { id: In([...skuPlan.keys()]) } });
      for (const sku of rows) {
        if (sku.stock !== null) {
          sku.stock += skuPlan.get(sku.id) ?? 0;
        }
      }
      await manager.getRepository(DishSku).save(rows);
    }
  }

  private briefView(order: Order, items: OrderItem[]): ClientOrderBriefView {
    const payable = order.payStatus === PayStatus.Unpaid;
    return {
      orderNo: order.orderNo,
      status: order.status,
      statusLabel: ORDER_STATUS_LABELS[order.status],
      payStatus: order.payStatus,
      payStatusLabel: PAY_STATUS_LABELS[order.payStatus],
      dineType: order.dineType,
      dineTypeLabel: DINE_TYPE_LABELS[order.dineType],
      tableNo: order.tableNo,
      peopleCount: order.peopleCount,
      // 取餐码只在订单真的会被出品时下发，未付款和已关单的号都不给顾客。
      pickupCode: codeVisible(order) ? order.pickupCode : null,
      itemCount: items.length,
      dishAmount: order.dishAmount,
      packingAmount: order.packingAmount,
      deliveryAmount: order.deliveryAmount,
      discountAmount: order.discountAmount,
      payAmount: order.payAmount,
      remark: order.remark,
      handleRemark: order.handleRemark,
      // 单店视图不需要标注门店，跨店列表由 listAllStores 覆盖这两个字段
      storeName: null,
      storeCode: null,
      createdAt: order.createdAt,
      acceptedAt: order.acceptedAt,
      readyAt: order.readyAt,
      completedAt: order.completedAt,
      cancelledAt: order.cancelledAt,
      cancelReason: order.cancelReason,
      canCancel: order.status === OrderStatus.Pending && payable,
      canPay: payable && !isClosed(order.status),
      payRemainingSeconds: null,
      items: items.map((item) => ({
        id: item.id,
        dishId: item.dishId,
        dishName: item.dishName,
        dishImage: item.dishImage,
        skuId: item.skuId,
        specDesc: item.specDesc,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        totalAmount: item.totalAmount,
        remark: item.remark,
      })),
    };
  }

  private async traceView(order: Order, items: OrderItem[]): Promise<ClientOrderTraceView> {
    const brief = this.briefView(order, items);
    const payment = await this.latestPayment(order);
    return {
      ...brief,
      payRemainingSeconds: remainingSecondsOf(payment),
      steps: stepsOf(order),
      estimate: estimateOf(order),
      closedTip: closedTipOf(order),
    };
  }

  private async latestPayment(order: Order): Promise<Payment | null> {
    if (order.payStatus !== PayStatus.Unpaid) {
      return null;
    }
    const [payment] = await this.dataSource.getRepository(Payment).find({
      where: { orderId: order.id, status: In([...OPEN_PAYMENT_STATUSES]) },
      order: { id: 'DESC' },
      take: 1,
    });
    return payment ?? null;
  }
}

/* ============================ 纯函数：视图装配 ============================ */

function toCouponLine(line: PricedOrder['lines'][number]) {
  return { dishId: line.dishId, categoryId: line.categoryId, totalCents: line.totalCents };
}

function toCheckoutLine(line: PricedOrder['lines'][number]): ClientCheckoutLine {
  return {
    dishId: line.dishId,
    dishName: line.dishName,
    dishImage: line.dishImage,
    specDesc: line.specDesc,
    unitPrice: toYuan(line.unitPriceCents),
    quantity: line.quantity,
    totalAmount: toYuan(line.totalCents),
    memberPriced: line.memberPriced,
    promotionPriced: line.promotionPriced,
    promotionBadge: line.promotionBadge,
  };
}

function amountsOf(priced: PricedOrder) {
  return {
    dishAmount: toYuan(priced.dishAmountCents),
    packingAmount: toYuan(priced.packingAmountCents),
    deliveryAmount: toYuan(priced.deliveryAmountCents),
    discountAmount: toYuan(priced.discountCents),
    payAmount: toYuan(priced.payAmountCents),
  };
}

/** 结算页顶部提示：会员价与打包费这类"钱是怎么来的"必须说清楚。 */
function tipsOf(priced: PricedOrder): string[] {
  const tips: string[] = [];
  if (priced.lines.some((line) => line.memberPriced)) {
    tips.push('已享会员价优惠');
  }
  if (priced.lines.some((line) => line.promotionPriced)) {
    tips.push('已享限时活动价');
  }
  if (priced.packingAmountCents > 0) {
    tips.push('非堂食按份收取打包费');
  }
  if (priced.deliveryAmountCents > 0) {
    tips.push('外送订单加收配送费');
  }
  return tips;
}

function isClosed(status: OrderStatus): boolean {
  return status === OrderStatus.Cancelled || status === OrderStatus.Refunded;
}

/** 取餐码发号在支付成功那一刻（见 PaymentService.markOrderPaid），这里只决定要不要给顾客看。 */
function codeVisible(order: Order): boolean {
  return order.payStatus !== PayStatus.Unpaid && !isClosed(order.status);
}

function stepsOf(order: Order): OrderTraceStep[] {
  const stage = traceStage(order.status);
  return TRACE_STEPS.map((step, index) => ({
    ...step,
    done: index < stage,
    current: index === stage,
    at: stepTime(order, index),
  }));
}

/** 订单状态 -> 处于第几步；取消/退款单独成态，不混进度条。 */
function traceStage(status: OrderStatus): number {
  if (status === OrderStatus.Pending) {
    return 1;
  }
  if (status === OrderStatus.Accepted) {
    return 2;
  }
  if (status === OrderStatus.Preparing || status === OrderStatus.Ready) {
    return 2;
  }
  if (status === OrderStatus.Completed) {
    return 4;
  }
  return 0;
}

function stepTime(order: Order, index: number): Date | null {
  if (index === 0) {
    return order.createdAt;
  }
  if (index === 1) {
    return order.acceptedAt;
  }
  if (index === 2) {
    return order.acceptedAt;
  }
  return order.completedAt;
}

function estimateOf(order: Order): OrderEstimate | null {
  if (isClosed(order.status) || order.status === OrderStatus.Completed) {
    return null;
  }
  // 后厨从付到款才开始排单，未支付就报「预计还需 15 分钟」是把没开始的倒计时提前跑了
  if (order.payStatus === PayStatus.Unpaid) {
    return null;
  }
  const from = order.acceptedAt ?? order.createdAt;
  const readyAt = new Date(from.getTime() + ESTIMATE_PREPARE_MINUTES * 60_000);
  const remainingSeconds = Math.max(Math.round((readyAt.getTime() - Date.now()) / 1000), 0);
  return {
    minutes: ESTIMATE_PREPARE_MINUTES,
    remainingSeconds,
    text: remainingSeconds === 0 ? '出餐时间已到，请注意取餐' : `预计还需 ${Math.ceil(remainingSeconds / 60)} 分钟`,
  };
}

function closedTipOf(order: Order): string | null {
  if (order.status === OrderStatus.Cancelled) {
    return order.cancelReason ? `订单已取消：${order.cancelReason}` : '订单已取消';
  }
  // 退款属于「钱」的状态，与出餐进度无关：一单可以已完成后再被整单退款，
  // 只看 status 就会漏掉这种情况，顾客那边等于没有解释。
  if (order.payStatus === PayStatus.Refunded) {
    return '订单已退款，款项将原路返回';
  }
  if (order.payStatus === PayStatus.PartiallyRefunded) {
    return '本单已部分退款，明细可咨询门店';
  }
  if (order.status === OrderStatus.Ready) {
    return `餐已就绪，凭取餐码 ${order.pickupCode ?? ''} 取餐`;
  }
  return null;
}

function remainingSecondsOf(payment: Payment | null): number | null {
  if (!payment) {
    return null;
  }
  return Math.max(Math.round((payment.expireAt.getTime() - Date.now()) / 1000), 0);
}
