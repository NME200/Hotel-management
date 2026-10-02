import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import {
  Between,
  DataSource,
  In,
  LessThan,
  LessThanOrEqual,
  Like,
  MoreThan,
  MoreThanOrEqual,
  QueryFailedError,
  type EntityManager,
  type FindOptionsWhere,
  type Repository,
} from 'typeorm';
import { PayStatus } from '../../common/constants/dict';
import type { PageResult } from '../../common/dto/page-result.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { TenantRepo } from '../../common/repository/tenant.repo';
import { endOfDay, startOfDay } from '../../common/utils/date.util';
import { generatePickupCode, generatePaymentNo, generateRefundNo, PICKUP_CODE_RETRY } from '../../common/utils/id.util';
import { likePattern } from '../../common/utils/like.util';
import { toCents, toYuan } from '../../common/utils/money.util';
import { Order } from '../../database/entities/order.entity';
import { Payment } from '../../database/entities/payment.entity';
import { PaymentNotifyLog } from '../../database/entities/payment-notify-log.entity';
import { PaymentRefund } from '../../database/entities/payment-refund.entity';
import {
  NotifyType,
  OPEN_PAYMENT_STATUSES,
  PAYMENT_EXPIRE_MINUTES,
  PaymentChannel,
  PaymentStatus,
  RefundStatus,
} from './constants/payment.constant';
import type { CreatePaymentDto, CreateRefundDto } from './dto/payment.dto';
import type { PaymentListQueryDto } from './dto/payment-list-query.dto';
import type { PaymentView, RefundView } from './models/payment-view.model';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import { PaymentConfigService } from './payment-config.service';
import { PaymentProfitShareService } from './services/payment-profit-share.service';
import type {
  NormalizedNotify,
  NotifyAck,
  PaymentProvider,
} from './providers/payment-provider.interface';

const DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly payments: TenantRepo<Payment>;
  private readonly refunds: TenantRepo<PaymentRefund>;
  private readonly orders: TenantRepo<Order>;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Payment) paymentRepository: Repository<Payment>,
    @InjectRepository(PaymentRefund) refundRepository: Repository<PaymentRefund>,
    @InjectRepository(PaymentNotifyLog)
    private readonly notifyLogs: Repository<PaymentNotifyLog>,
    @InjectRepository(Order) orderRepository: Repository<Order>,
    private readonly registry: PaymentProviderRegistry,
    private readonly configService: PaymentConfigService,
    private readonly profitShares: PaymentProfitShareService,
  ) {
    this.payments = new TenantRepo(paymentRepository);
    this.refunds = new TenantRepo(refundRepository);
    this.orders = new TenantRepo(orderRepository);
  }

  /* ------------------------------ 下单 ------------------------------ */

  /**
   * 发起支付。同一订单的未支付支付单会被复用，切换渠道时先关掉旧的，
   * 避免顾客反复点击"去支付"堆出一堆有效支付单——那会产生多扣款。
   */
  async create(merchantId: number, dto: CreatePaymentDto): Promise<PaymentView> {
    // 先过配置层的三重闸门（渠道开关 / 凭据就绪 / 商户已开通），再拿 provider
    const payable = await this.configService.resolvePayable(merchantId, dto.channel);
    const provider = this.registry.requireReady(dto.channel);
    const order = await this.orders.findById(merchantId, dto.orderId);

    if (order.payStatus === PayStatus.Paid) {
      throw BusinessException.conflict('该订单已支付');
    }

    const amountCents = toCents(order.payAmount);
    if (amountCents <= 0) {
      throw BusinessException.badRequest('订单金额为零，无需支付');
    }

    const openOnes = await this.payments.list(merchantId, {
      where: { orderId: order.id, status: In([...OPEN_PAYMENT_STATUSES]) },
      order: { id: 'DESC' },
    });

    const reusable = openOnes.find(
      (item) => item.channel === dto.channel && item.expireAt.getTime() > Date.now(),
    );
    if (reusable) {
      return this.toView(reusable);
    }

    for (const stale of openOnes) {
      await this.closePayment(merchantId, stale);
    }

    const expireAt = new Date(Date.now() + PAYMENT_EXPIRE_MINUTES * 60_000);
    const needProfitSharing =
      payable.profitShareRate !== null && payable.profitShareRate > 0;
    const payment = await this.payments.create(merchantId, {
      paymentNo: generatePaymentNo(),
      orderId: order.id,
      channel: dto.channel,
      channelAccount: payable.channelAccount,
      amountCents,
      status: PaymentStatus.Created,
      needProfitSharing,
      refundedCents: 0,
      expireAt,
    });

    try {
      const created = await provider.create({
        payment,
        order,
        payerId: dto.payerId,
        channelAccount: payable.channelAccount ?? undefined,
        needProfitSharing,
      });

      payment.tradeNo = created.tradeNo;
      payment.prepayId = created.prepayId;
      payment.payParams = created.payParams;
      payment.status = created.status;
      payment.paidAt = created.paidAt;
      await this.payments.persist(payment);

      if (created.status === PaymentStatus.Succeeded) {
        await this.markOrderPaid(merchantId, payment);
      }
      return this.toView(payment);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      payment.status = PaymentStatus.Failed;
      payment.failureReason = message.slice(0, 255);
      await this.payments.persist(payment);
      this.logger.error(`渠道下单失败 paymentNo=${payment.paymentNo}: ${message}`);
      throw new BusinessException('发起支付失败，请稍后重试', HttpStatus.BAD_GATEWAY);
    }
  }

  /* ---------------------------- 查询与纠偏 ---------------------------- */

  async getByPaymentNo(merchantId: number, paymentNo: string): Promise<PaymentView> {
    const payment = await this.payments.findBy(merchantId, { paymentNo });
    if (!payment) {
      throw BusinessException.notFound('支付单不存在');
    }
    if (OPEN_PAYMENT_STATUSES.includes(payment.status)) {
      return this.toView(await this.syncPayment(merchantId, payment));
    }
    return this.toView(payment);
  }

  async getByOrder(merchantId: number, orderId: number): Promise<PaymentView | null> {
    const [payment] = await this.payments.list(merchantId, {
      where: { orderId },
      order: { id: 'DESC' },
      take: 1,
    });
    return payment ? this.toView(payment) : null;
  }

  /** 主动查单：回调可能丢，客户端轮询与定时任务都靠它兜底。 */
  private async syncPayment(merchantId: number, payment: Payment): Promise<Payment> {
    if (payment.status === PaymentStatus.Closed) {
      return payment;
    }
    const provider = this.registry.resolve(payment.channel);
    if (!provider.isReady()) {
      return payment;
    }

    try {
      const state = await provider.query(payment);
      if (state.status === PaymentStatus.Succeeded) {
        const changed = await this.applyPaymentSucceeded(
          this.dataSource.manager,
          payment,
          state.tradeNo,
          state.paidAt ?? new Date(),
          state.amountCents,
        );
        if (changed && state.amountCents === payment.amountCents) {
          await this.markOrderPaid(merchantId, payment);
        }
      }
      return (await this.payments.findById(merchantId, payment.id)) ?? payment;
    } catch (error) {
      this.logger.warn(
        `查单失败 paymentNo=${payment.paymentNo}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return payment;
    }
  }

  async list(
    merchantId: number,
    query: PaymentListQueryDto,
  ): Promise<PageResult<PaymentView>> {
    const keyword = query.keyword?.trim();
    const base: FindOptionsWhere<Payment> = {
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.orderNo ? { orderId: await this.orderIdByNo(merchantId, query.orderNo) } : {}),
      ...(query.from && query.to
        ? { createdAt: Between(startOfDay(query.from), endOfDay(query.to)) }
        : query.from
          ? { createdAt: MoreThanOrEqual(startOfDay(query.from)) }
          : query.to
            ? { createdAt: LessThanOrEqual(endOfDay(query.to)) }
            : {}),
    };

    const where: FindOptionsWhere<Payment> | FindOptionsWhere<Payment>[] = keyword
      ? [
          { ...base, paymentNo: Like(likePattern(keyword)) },
          { ...base, tradeNo: Like(likePattern(keyword)) },
        ]
      : base;

    const result = await this.payments.page(merchantId, query, { where, order: { id: 'DESC' } });
    return { ...result, list: result.list.map((item) => this.toView(item)) };
  }

  /** 订单号 -> 订单 ID：订单号在商户内查，查不到就用一个不可能存在的 ID 保证返回空列表。 */
  private async orderIdByNo(merchantId: number, orderNo: string): Promise<number> {
    const order = await this.orders.findBy(merchantId, { orderNo });
    return order?.id ?? -1;
  }

  /* ------------------------------ 回调 ------------------------------ */

  /**
   * 处理渠道异步通知。
   * 顺序固定为：验签解析 → 原始通知落库去重 → 金额核对 → 状态机 CAS → 应答。
   * 通知落库必须在业务处理之前且独立成事务，这样处理失败也能凭日志重放。
   */
  async handleNotify(channel: PaymentChannel, request: Request): Promise<NotifyAck> {
    const provider = this.registry.resolve(channel);

    let notify: NormalizedNotify;
    try {
      notify = await provider.parseNotify(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`${channel} 通知验签/解析失败: ${message}`);
      return provider.buildAck('invalid notification');
    }

    const logged = await this.saveNotifyLog(channel, notify, request);
    if (!logged) {
      // 同一 notifyId 已被处理过，直接回成功，让渠道停止重试
      return provider.buildAck();
    }

    try {
      await this.applyNotify(notify);
      await this.notifyLogs.update(
        { channel, notifyId: notify.notifyId },
        { handled: true, processResult: 'processed' },
      );
      return provider.buildAck();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`通知处理失败 notifyId=${notify.notifyId}: ${message}`);
      await this.notifyLogs.update(
        { channel, notifyId: notify.notifyId },
        { handled: false, processResult: message.slice(0, 255) },
      );
      // 返回失败应答，让渠道按重试策略再投
      return provider.buildAck(message.slice(0, 200));
    }
  }

  private async applyNotify(notify: NormalizedNotify): Promise<void> {
    if (notify.type === NotifyType.Refund) {
      await this.applyRefundNotify(notify);
      return;
    }
    await this.applyPaymentNotify(notify);
  }

  private async applyPaymentNotify(notify: NormalizedNotify): Promise<void> {
    if (!notify.paymentNo) {
      throw BusinessException.badRequest('通知缺少商户支付单号');
    }
    const payment = await this.dataSource.getRepository(Payment).findOne({
      where: { paymentNo: notify.paymentNo },
    });
    if (!payment) {
      throw BusinessException.notFound('支付单不存在');
    }

    if (notify.amountCents !== null && notify.amountCents !== payment.amountCents) {
      // 金额不符必然有问题：伪造、串单或渠道异常，一律不入账
      this.logger.error(
        `支付通知金额不符 paymentNo=${payment.paymentNo} 本地=${payment.amountCents} 通知=${notify.amountCents}`,
      );
      throw BusinessException.badRequest('通知金额与支付单不一致');
    }

    if (!notify.succeeded) {
      await this.dataSource
        .getRepository(Payment)
        .update(
          { id: payment.id, status: In([...OPEN_PAYMENT_STATUSES]) },
          { status: PaymentStatus.Failed, failureReason: '渠道通知交易失败' },
        );
      return;
    }

    const changed = await this.applyPaymentSucceeded(
      this.dataSource.manager,
      payment,
      notify.tradeNo,
      notify.paidAt ?? new Date(),
      notify.amountCents ?? payment.amountCents,
    );
    if (changed) {
      await this.markOrderPaid(payment.merchantId, payment);
    }
  }

  private async applyRefundNotify(notify: NormalizedNotify): Promise<void> {
    if (!notify.refundNo) {
      throw BusinessException.badRequest('退款通知缺少商户退款单号');
    }
    const refund = await this.dataSource.getRepository(PaymentRefund).findOne({
      where: { refundNo: notify.refundNo },
    });
    if (!refund) {
      throw BusinessException.notFound('退款单不存在');
    }

    if (!notify.succeeded) {
      await this.dataSource
        .getRepository(PaymentRefund)
        .update(
          { id: refund.id, status: RefundStatus.Processing },
          { status: RefundStatus.Failed, failureReason: '渠道退款失败' },
        );
      return;
    }

    const changed = await this.applyRefundSucceeded(this.dataSource.manager, refund, notify.tradeNo);
    if (changed) {
      await this.refreshOrderRefundStatus(refund.merchantId, refund.orderId);
    }
  }

  /** 通知落库去重：返回 false 表示这条通知已经处理过。 */
  private async saveNotifyLog(
    channel: PaymentChannel,
    notify: NormalizedNotify,
    request: Request,
  ): Promise<boolean> {
    const merchantId = await this.resolveMerchantId(notify);
    try {
      const log = this.notifyLogs.create({
        channel,
        merchantId,
        notifyType: notify.type,
        notifyId: notify.notifyId,
        paymentNo: notify.paymentNo,
        refundNo: notify.refundNo,
        tradeNo: notify.tradeNo,
        amountCents: notify.amountCents,
        payload: notify.payload,
        rawBody: JSON.stringify(request.body ?? {}).slice(0, 4000),
        verified: true,
        handled: false,
      });
      await this.notifyLogs.save(log);
      return true;
    } catch (error) {
      if (error instanceof QueryFailedError && isDuplicateEntry(error)) {
        return false;
      }
      throw error;
    }
  }

  private async resolveMerchantId(notify: NormalizedNotify): Promise<number | null> {
    const key = notify.refundNo ?? notify.paymentNo;
    if (!key) {
      return null;
    }
    if (notify.refundNo) {
      const refund = await this.dataSource
        .getRepository(PaymentRefund)
        .findOne({ where: { refundNo: notify.refundNo } });
      return refund?.merchantId ?? null;
    }
    const payment = await this.dataSource
      .getRepository(Payment)
      .findOne({ where: { paymentNo: notify.paymentNo ?? '' } });
    return payment?.merchantId ?? null;
  }

  /* ------------------------------ 退款 ------------------------------ */

  async refund(
    merchantId: number,
    orderId: number,
    dto: CreateRefundDto,
    operator: { id: number; name: string },
  ): Promise<RefundView> {
    const payment = await this.payments.findBy(merchantId, {
      orderId,
      status: PaymentStatus.Succeeded,
    });
    if (!payment) {
      throw BusinessException.badRequest('该订单没有可退款的支付记录');
    }

    const remaining = payment.amountCents - payment.refundedCents;
    const amountCents = dto.amount === undefined ? remaining : toCents(dto.amount);
    if (amountCents <= 0) {
      throw BusinessException.badRequest('退款金额必须大于 0');
    }
    if (amountCents > remaining) {
      throw BusinessException.badRequest(`最多可退 ${toYuan(remaining)} 元`);
    }

    const provider = this.registry.requireReady(payment.channel);
    const refund = await this.refunds.create(merchantId, {
      refundNo: generateRefundNo(),
      paymentId: payment.id,
      orderId,
      channel: payment.channel,
      amountCents,
      totalAmountCents: payment.amountCents,
      status: RefundStatus.Processing,
      reason: dto.reason ?? null,
      operatorId: operator.id,
      operatorName: operator.name,
    });

    try {
      const result = await provider.refund(refund, payment);
      refund.channelRefundId = result.channelRefundId;
      await this.refunds.persist(refund);

      if (result.status === RefundStatus.Succeeded) {
        const succeededAt = new Date();
        const changed = await this.applyRefundSucceeded(
          this.dataSource.manager,
          refund,
          result.channelRefundId,
          succeededAt,
        );
        if (changed) {
          await this.refreshOrderRefundStatus(merchantId, orderId);
          // 同步内存对象，否则接口会把已成功的退款返回成 processing
          refund.status = RefundStatus.Succeeded;
          refund.succeededAt = succeededAt;
        }
      }
      return this.toRefundView(refund);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      refund.status = RefundStatus.Failed;
      refund.failureReason = message.slice(0, 255);
      await this.refunds.persist(refund);
      this.logger.error(`退款失败 refundNo=${refund.refundNo}: ${message}`);
      throw new BusinessException('退款请求失败，请稍后重试', HttpStatus.BAD_GATEWAY);
    }
  }

  async listRefunds(merchantId: number, orderId: number): Promise<RefundView[]> {
    const rows = await this.refunds.list(merchantId, {
      where: { orderId },
      order: { id: 'DESC' },
    });
    return rows.map((row) => this.toRefundView(row));
  }

  /* --------------------------- 定时任务入口 --------------------------- */

  /** 关闭超时未支付的支付单，防止顾客拿到失效的调起参数后重复扣款。 */
  async closeExpiredPayments(): Promise<number> {
    const due = await this.dataSource.getRepository(Payment).find({
      where: { status: In([...OPEN_PAYMENT_STATUSES]), expireAt: LessThan(new Date()) },
      take: 200,
    });

    let closed = 0;
    for (const payment of due) {
      const provider = this.registry.resolve(payment.channel);
      let skipClose = false;
      try {
        if (provider.isReady()) {
          // 关单前先查一次，避免"已支付但回调丢失"的单被误关
          const state = await provider.query(payment);
          if (state.status === PaymentStatus.Succeeded) {
            const changed = await this.applyPaymentSucceeded(
              this.dataSource.manager,
              payment,
              state.tradeNo,
              state.paidAt ?? new Date(),
              state.amountCents,
            );
            if (changed) {
              await this.markOrderPaid(payment.merchantId, payment);
            }
            continue;
          }
          await provider.close(payment);
        }
      } catch (error) {
        this.logger.warn(
          `渠道关单失败 paymentNo=${payment.paymentNo}: ${error instanceof Error ? error.message : String(error)}`,
        );
        // 渠道状态未知时宁可留给下一轮，也不能冒"钱已收到却把单关掉"的风险
        skipClose = true;
      }

      if (skipClose) {
        continue;
      }

      const result = await this.dataSource
        .getRepository(Payment)
        .update(
          { id: payment.id, status: In([...OPEN_PAYMENT_STATUSES]) },
          { status: PaymentStatus.Closed, closedAt: new Date() },
        );
      closed += result.affected ?? 0;
    }
    return closed;
  }

  /** 轮询未支付完成的支付单向渠道对账，弥补通知丢失。 */
  async syncPendingPayments(): Promise<number> {
    const pending = await this.dataSource.getRepository(Payment).find({
      where: {
        status: In([...OPEN_PAYMENT_STATUSES]),
        expireAt: MoreThan(new Date()),
        createdAt: LessThan(new Date(Date.now() - 30_000)),
      },
      take: 100,
    });

    let fixed = 0;
    for (const payment of pending) {
      const before = payment.status;
      await this.syncPayment(payment.merchantId, payment);
      const after = await this.dataSource.getRepository(Payment).findOne({ where: { id: payment.id } });
      if (after && after.status !== before && after.status === PaymentStatus.Succeeded) {
        fixed += 1;
      }
    }
    return fixed;
  }

  /* ------------------------------ 内部 ------------------------------ */

  /**
   * 支付成功状态机：created/paying -> succeeded。
   * 返回 false 说明已被其它并发请求改过，调用方据此避免重复记账。
   */
  private async applyPaymentSucceeded(
    manager: EntityManager,
    payment: Payment,
    tradeNo: string | null,
    paidAt: Date,
    amountCents: number,
  ): Promise<boolean> {
    if (amountCents !== payment.amountCents) {
      throw BusinessException.badRequest('通知金额与支付单不一致');
    }
    const result = await manager.getRepository(Payment).update(
      { id: payment.id, status: In([...OPEN_PAYMENT_STATUSES]) },
      { status: PaymentStatus.Succeeded, tradeNo, paidAt },
    );
    return (result.affected ?? 0) > 0;
  }

  private async applyRefundSucceeded(
    manager: EntityManager,
    refund: PaymentRefund,
    channelRefundId: string | null,
    succeededAt: Date = new Date(),
  ): Promise<boolean> {
    const result = await manager.getRepository(PaymentRefund).update(
      { id: refund.id, status: RefundStatus.Processing },
      { status: RefundStatus.Succeeded, succeededAt, channelRefundId },
    );
    if ((result.affected ?? 0) === 0) {
      return false;
    }

    await manager.getRepository(Payment).increment({ id: refund.paymentId }, 'refundedCents', refund.amountCents);
    return true;
  }

  private async markOrderPaid(merchantId: number, payment: Payment): Promise<void> {
    const order = await this.orders.findById(merchantId, payment.orderId);
    order.payStatus = PayStatus.Paid;
    // 付到款才算进了出品队列，取餐码在这一刻才发。
    // 已经有号的单保持原号（通知重放、迁移前的历史数据），喊到一半的号不能中途换。
    order.pickupCode = order.pickupCode ?? (await this.assignPickupCode(merchantId, order.createdAt));
    await this.orders.persist(order);
    // 订单置为已支付后立刻生成分账单：抽佣比例此时再查一次，
    // 避免把下单时的快照沿用到一个已经改过比例的商户上。
    try {
      const rate = await this.configService.findProfitShareRate(merchantId, payment.channel);
      await this.profitShares.generateForPayment(merchantId, payment, rate);
    } catch (error) {
      // 分账失败不能影响"订单已支付"这个事实，留给对账/补单兜底
      this.logger.error(
        `生成分账单失败 paymentNo=${payment.paymentNo}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** 取餐码只需在「同一商户同一天」内唯一，方便店员喊号。 */
  private async assignPickupCode(merchantId: number, created: Date): Promise<string> {
    for (let attempt = 0; attempt < PICKUP_CODE_RETRY; attempt += 1) {
      const code = generatePickupCode();
      const taken = await this.orders.exists(merchantId, {
        pickupCode: code,
        createdAt: Between(startOfDay(created), endOfDay(created)),
      });
      if (!taken) {
        return code;
      }
    }
    return generatePickupCode();
  }

  private async refreshOrderRefundStatus(merchantId: number, orderId: number): Promise<void> {
    const payment = await this.payments.findBy(merchantId, {
      orderId,
      status: PaymentStatus.Succeeded,
    });
    if (!payment) {
      return;
    }
    const reloaded = await this.payments.findById(merchantId, payment.id);
    const payStatus =
      reloaded.refundedCents >= reloaded.amountCents
        ? PayStatus.Refunded
        : reloaded.refundedCents > 0
          ? PayStatus.PartiallyRefunded
          : PayStatus.Paid;
    await this.orders.update(merchantId, orderId, { payStatus });
  }

  private async closePayment(merchantId: number, payment: Payment, provider?: PaymentProvider): Promise<void> {
    const channelProvider = provider ?? this.registry.resolve(payment.channel);
    try {
      if (channelProvider.isReady()) {
        await channelProvider.close(payment);
      }
    } catch (error) {
      this.logger.warn(
        `切换渠道时关单失败 paymentNo=${payment.paymentNo}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await this.payments.update(merchantId, payment.id, {
      status: PaymentStatus.Closed,
      closedAt: new Date(),
    });
  }

  private toView(payment: Payment): PaymentView {
    return {
      id: payment.id,
      merchantId: payment.merchantId,
      orderId: payment.orderId,
      paymentNo: payment.paymentNo,
      channel: payment.channel,
      tradeNo: payment.tradeNo,
      amount: toYuan(payment.amountCents),
      refundedAmount: toYuan(payment.refundedCents),
      status: payment.status,
      payParams: payment.payParams,
      expireAt: payment.expireAt,
      paidAt: payment.paidAt,
      closedAt: payment.closedAt,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt,
    };
  }

  private toRefundView(refund: PaymentRefund): RefundView {
    return {
      id: refund.id,
      refundNo: refund.refundNo,
      paymentId: refund.paymentId,
      orderId: refund.orderId,
      channel: refund.channel,
      channelRefundId: refund.channelRefundId,
      amount: toYuan(refund.amountCents),
      status: refund.status,
      reason: refund.reason,
      operatorName: refund.operatorName,
      succeededAt: refund.succeededAt,
      createdAt: refund.createdAt,
    };
  }
}

function isDuplicateEntry(error: QueryFailedError): boolean {
  const driverError = (error as QueryFailedError & { code?: string; errno?: number });
  return driverError.code === DUPLICATE_ENTRY || driverError.errno === 1062;
}
