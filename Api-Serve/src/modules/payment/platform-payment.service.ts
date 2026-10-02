import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  In,
  LessThanOrEqual,
  Like,
  MoreThanOrEqual,
  type FindOptionsWhere,
  type Repository,
} from 'typeorm';
import {
  buildPageResult,
  type PageResult,
} from '../../common/dto/page-result.dto';
import { toSkipTake } from '../../common/dto/page-query.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { endOfDay, startOfDay } from '../../common/utils/date.util';
import { likePattern } from '../../common/utils/like.util';
import { toYuan } from '../../common/utils/money.util';
import { Merchant } from '../../database/entities/merchant.entity';
import { Order } from '../../database/entities/order.entity';
import { Payment } from '../../database/entities/payment.entity';
import { PaymentNotifyLog } from '../../database/entities/payment-notify-log.entity';
import { PaymentRefund } from '../../database/entities/payment-refund.entity';
import {
  OPEN_PAYMENT_STATUSES,
  PaymentStatus,
  RefundStatus,
} from './constants/payment.constant';
import type {
  PlatformPaymentQueryDto,
  PlatformRefundQueryDto,
} from './dto/platform-payment-query.dto';
import type {
  PlatformPaymentItem,
  PlatformPaymentSummary,
  PlatformRefundItem,
} from './models/platform-payment.model';

/**
 * 平台端支付流水。
 *
 * 这里**刻意不复用 TenantRepo**：平台视角本来就要跨租户看数据，
 * 强制并入 merchantId 反而表达不了"全平台流水"，也会让"按商户筛选"
 * 退化成一个必填条件。租户隔离在这一层关闭，由接口权限点
 * （platform:payment:read，只有平台角色有）兜住访问边界。
 *
 * 写操作一概不在这里——平台对资金只读，退款仍只能由商家端发起。
 */
@Injectable()
export class PlatformPaymentService {
  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(PaymentRefund) private readonly refunds: Repository<PaymentRefund>,
    @InjectRepository(PaymentNotifyLog)
    private readonly notifyLogs: Repository<PaymentNotifyLog>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Merchant) private readonly merchants: Repository<Merchant>,
  ) {}

  async page(query: PlatformPaymentQueryDto): Promise<PageResult<PlatformPaymentItem>> {
    const where = await this.buildWhere(query);
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [rows, total] = await this.payments.findAndCount({
      where,
      order: { id: 'DESC' },
      skip,
      take,
    });

    const context = await this.loadContext(rows);
    const list = rows.map((row) => this.toItem(row, context));
    return buildPageResult(list, total, query.page, query.pageSize);
  }

  async refundPage(query: PlatformRefundQueryDto): Promise<PageResult<PlatformRefundItem>> {
    const where = await this.buildRefundWhere(query);
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [rows, total] = await this.refunds.findAndCount({
      where,
      order: { id: 'DESC' },
      skip,
      take,
    });

    const context = await this.loadContextForRefunds(rows);
    const list = rows.map((row) => this.toRefundItem(row, context));
    return buildPageResult(list, total, query.page, query.pageSize);
  }

  /** 单笔详情：多回一份该支付单收到的全部渠道通知，便于排障时看原始报文。 */
  async detail(paymentNo: string): Promise<PlatformPaymentItem> {
    const payment = await this.payments.findOne({ where: { paymentNo } });
    if (!payment) {
      throw BusinessException.notFound('支付单不存在');
    }
    const context = await this.loadContext([payment]);
    return this.toItem(payment, context);
  }

  /** 该支付单的渠道通知记录（含未处理的），按时间正序。 */
  async notifies(paymentNo: string): Promise<Record<string, unknown>[]> {
    const payment = await this.payments.findOne({ where: { paymentNo } });
    if (!payment) {
      throw BusinessException.notFound('支付单不存在');
    }
    const logs = await this.notifyLogs.find({
      where: { paymentNo },
      order: { id: 'ASC' },
    });
    return logs.map((log) => ({
      id: log.id,
      channel: log.channel,
      notifyType: log.notifyType,
      notifyId: log.notifyId,
      tradeNo: log.tradeNo,
      amount: log.amountCents === null ? null : toYuan(log.amountCents),
      verified: log.verified,
      handled: log.handled,
      processResult: log.processResult,
      payload: log.payload,
      rawBody: log.rawBody,
      createdAt: log.createdAt,
    }));
  }

  /**
   * 平台支付概况。
   * 交易额只统计 `succeeded`，退款单独列出而不冲抵——
   * 冲抵之后看不出真实交易规模，"今日 0 元"这种结论会把运营误导。
   */
  async summary(): Promise<PlatformPaymentSummary> {
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    const [totalCount, totalSum, todayCount, todaySum, refundAgg, refundCount, openCount, closedCount, failedCount] =
      await Promise.all([
        this.payments.count({ where: { status: PaymentStatus.Succeeded } }),
        this.payments.sum('amountCents', { status: PaymentStatus.Succeeded }),
        this.payments.count({
          where: { status: PaymentStatus.Succeeded, paidAt: Between(todayStart, todayEnd) },
        }),
        this.payments.sum('amountCents', {
          status: PaymentStatus.Succeeded,
          paidAt: Between(todayStart, todayEnd),
        }),
        this.refunds.sum('amountCents', { status: RefundStatus.Succeeded }),
        this.refunds.count({ where: { status: RefundStatus.Succeeded } }),
        this.payments.count({ where: { status: In([...OPEN_PAYMENT_STATUSES]) } }),
        this.payments.count({ where: { status: PaymentStatus.Closed } }),
        this.payments.count({ where: { status: PaymentStatus.Failed } }),
      ]);

    return {
      totalCount,
      totalAmount: toYuan(Number(totalSum ?? 0)),
      todayCount,
      todayAmount: toYuan(Number(todaySum ?? 0)),
      refundAmount: toYuan(Number(refundAgg ?? 0)),
      refundCount,
      openCount,
      closedCount,
      failedCount,
    };
  }

  /* ------------------------------ 内部 ------------------------------ */

  private async buildWhere(
    query: PlatformPaymentQueryDto,
  ): Promise<FindOptionsWhere<Payment> | FindOptionsWhere<Payment>[]> {
    const where: FindOptionsWhere<Payment> = {
      ...(query.merchantId ? { merchantId: query.merchantId } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...this.rangeWhere(query.from, query.to),
    };

    const orderId = query.orderNo
      ? ((await this.orders.findOne({ where: { orderNo: query.orderNo }, select: { id: true } }))?.id ?? -1)
      : null;
    if (orderId !== null) {
      where.orderId = orderId;
    }

    const keyword = query.keyword?.trim();
    if (!keyword) {
      return where;
    }

    // 关键字三路"或"：商户名/编号、支付单号、渠道交易号。
    // 返回数组让 TypeORM 生成 OR 条件；商户名匹配不到时给一个不可能存在的
    // merchantId 让这一路恒假，而不是影响另外两路。
    const merchantIds = await this.merchantIdsByKeyword(keyword);
    return [
      { ...where, merchantId: merchantIds.length ? In(merchantIds) : -1 },
      { ...where, paymentNo: Like(likePattern(keyword)) },
      { ...where, tradeNo: Like(likePattern(keyword)) },
    ];
  }

  private async buildRefundWhere(
    query: PlatformRefundQueryDto,
  ): Promise<FindOptionsWhere<PaymentRefund> | FindOptionsWhere<PaymentRefund>[]> {
    const where: FindOptionsWhere<PaymentRefund> = {
      ...(query.merchantId ? { merchantId: query.merchantId } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...this.rangeWhere(query.from, query.to),
    };

    const keyword = query.keyword?.trim();
    if (!keyword) {
      return where;
    }

    const merchantIds = await this.merchantIdsByKeyword(keyword);
    return [
      { ...where, merchantId: merchantIds.length ? In(merchantIds) : -1 },
      { ...where, refundNo: Like(likePattern(keyword)) },
      { ...where, channelRefundId: Like(likePattern(keyword)) },
    ];
  }

  private rangeWhere(from?: string, to?: string): DateRange {
    if (from && to) {
      return { createdAt: Between(startOfDay(from), endOfDay(to)) };
    }
    if (from) {
      return { createdAt: MoreThanOrEqual(startOfDay(from)) };
    }
    if (to) {
      return { createdAt: LessThanOrEqual(endOfDay(to)) };
    }
    return {};
  }

  /** 按关键字解析出匹配的商户 ID 集合；关键字为空时返回空数组（调用方处理语义）。 */
  private async merchantIdsByKeyword(keyword: string): Promise<number[]> {
    const matched = await this.merchants.find({
      where: [
        { name: Like(likePattern(keyword)) },
        { code: Like(likePattern(keyword)) },
      ],
      select: { id: true },
    });
    return matched.map((item) => item.id);
  }

  /** 一次性把行关联的商户、订单、通知计数查出来，避免在循环里打数据库。 */
  private async loadContext(rows: Payment[]): Promise<PaymentContext> {
    const merchantIds = [...new Set(rows.map((row) => row.merchantId))];
    const orderIds = [...new Set(rows.map((row) => row.orderId))];
    const paymentNos = rows.map((row) => row.paymentNo);

    const [merchants, orders, notifyRows] = await Promise.all([
      merchantIds.length ? this.merchants.find({ where: { id: In(merchantIds) } }) : [],
      orderIds.length ? this.orders.find({ where: { id: In(orderIds) } }) : [],
      paymentNos.length
        ? this.notifyLogs.find({
            where: { paymentNo: In(paymentNos) },
            select: { paymentNo: true },
          })
        : [],
    ]);

    const notifyCount = new Map<string, number>();
    for (const row of notifyRows) {
      if (!row.paymentNo) {
        continue;
      }
      notifyCount.set(row.paymentNo, (notifyCount.get(row.paymentNo) ?? 0) + 1);
    }

    return {
      merchantMap: new Map(merchants.map((item) => [item.id, item] as const)),
      orderMap: new Map(orders.map((item) => [item.id, item] as const)),
      notifyCount,
      paymentMap: new Map(),
    };
  }

  private async loadContextForRefunds(rows: PaymentRefund[]): Promise<PaymentContext> {
    const merchantIds = [...new Set(rows.map((row) => row.merchantId))];
    const orderIds = [...new Set(rows.map((row) => row.orderId))];
    const paymentIds = [...new Set(rows.map((row) => row.paymentId))];

    const [merchants, orders, payments] = await Promise.all([
      merchantIds.length ? this.merchants.find({ where: { id: In(merchantIds) } }) : [],
      orderIds.length ? this.orders.find({ where: { id: In(orderIds) } }) : [],
      paymentIds.length ? this.payments.find({ where: { id: In(paymentIds) } }) : [],
    ]);

    return {
      merchantMap: new Map(merchants.map((item) => [item.id, item] as const)),
      orderMap: new Map(orders.map((item) => [item.id, item] as const)),
      notifyCount: new Map(),
      paymentMap: new Map(payments.map((item) => [item.id, item] as const)),
    };
  }

  private toItem(row: Payment, context: PaymentContext): PlatformPaymentItem {
    const merchant = context.merchantMap.get(row.merchantId);
    const order = context.orderMap.get(row.orderId);
    return {
      id: row.id,
      tradeNo: row.tradeNo,
      paymentNo: row.paymentNo,
      merchantId: row.merchantId,
      merchantCode: merchant?.code ?? '-',
      merchantName: merchant?.name ?? '-',
      orderId: row.orderId,
      orderNo: order?.orderNo ?? null,
      channel: row.channel,
      channelAccount: row.channelAccount,
      amount: toYuan(row.amountCents),
      refundedAmount: toYuan(row.refundedCents),
      status: row.status,
      needProfitSharing: row.needProfitSharing,
      notifyCount: context.notifyCount.get(row.paymentNo) ?? 0,
      expireAt: row.expireAt,
      paidAt: row.paidAt,
      closedAt: row.closedAt,
      failureReason: row.failureReason,
      createdAt: row.createdAt,
    };
  }

  private toRefundItem(row: PaymentRefund, context: PaymentContext): PlatformRefundItem {
    const merchant = context.merchantMap.get(row.merchantId);
    const order = context.orderMap.get(row.orderId);
    const payment = context.paymentMap.get(row.paymentId);
    return {
      id: row.id,
      refundNo: row.refundNo,
      merchantId: row.merchantId,
      merchantCode: merchant?.code ?? '-',
      merchantName: merchant?.name ?? '-',
      orderId: row.orderId,
      orderNo: order?.orderNo ?? null,
      paymentNo: payment?.paymentNo ?? null,
      channel: row.channel,
      channelRefundId: row.channelRefundId,
      amount: toYuan(row.amountCents),
      totalAmount: toYuan(row.totalAmountCents),
      status: row.status,
      reason: row.reason,
      operatorName: row.operatorName,
      succeededAt: row.succeededAt,
      createdAt: row.createdAt,
    };
  }
}

interface PaymentContext {
  merchantMap: Map<number, Merchant>;
  orderMap: Map<number, Order>;
  notifyCount: Map<string, number>;
  paymentMap: Map<number, Payment>;
}

/** 只有一个 createdAt 的日期区间条件，支付单与退款单共用。 */
interface DateRange {
  createdAt?: FindOptionsWhere<Payment>['createdAt'];
}
