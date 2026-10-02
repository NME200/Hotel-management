import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  type FindOptionsWhere,
  type Repository,
} from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { endOfDay, formatDateKey, startOfDay } from '../../../common/utils/date.util';
import { generateReconcileNo } from '../../../common/utils/id.util';
import { Payment } from '../../../database/entities/payment.entity';
import { PaymentReconcile } from '../../../database/entities/payment-reconcile.entity';
import { PaymentReconcileDetail } from '../../../database/entities/payment-reconcile-detail.entity';
import { PaymentRefund } from '../../../database/entities/payment-refund.entity';
import { PaymentChannel, PaymentStatus, RefundStatus } from '../constants/payment.constant';
import {
  OPEN_RECONCILE_STATUSES,
  RECONCILE_ENABLED_CHANNELS,
  RECONCILE_MAX_RETRY,
  ReconcileDiffType,
  ReconcileStatus,
} from '../constants/reconcile.constant';
import { PaymentProviderRegistry } from '../providers/payment-provider.registry';
import type { ChannelBill, ChannelBillDetail } from '../providers/payment-provider.interface';

/** 单笔渠道账单与本地的比对结果；null 表示一致。 */
interface DiffDraft {
  diffType: ReconcileDiffType;
  outTradeNo: string;
  paymentId: number | null;
  channelAmountCents: number | null;
  localAmountCents: number | null;
  diffAmountCents: number;
  channelTradeNo: string | null;
  localTradeNo: string | null;
  remark: string;
  channelPaidAt: Date | null;
  rawChannel: Record<string, unknown> | null;
}

/** 渠道账单取不到时抛这个，由编排层决定落台账还是交给任务重试。 */
class BillUnavailableError extends Error {}

@Injectable()
export class PaymentReconcileService {
  private readonly logger = new Logger(PaymentReconcileService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PaymentReconcile)
    private readonly reconciles: Repository<PaymentReconcile>,
    @InjectRepository(PaymentReconcileDetail)
    private readonly details: Repository<PaymentReconcileDetail>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(PaymentRefund) private readonly refunds: Repository<PaymentRefund>,
    private readonly registry: PaymentProviderRegistry,
  ) {}

  /* ---------------------------- 编排入口 ---------------------------- */

  /**
   * 对账一个自然日：先按「已在台账里的商户 × 渠道」重建，再扫出
   * 「当日有成功支付但还没建台账」的商户补齐。
   *
   * 分成两步是因为两者对「渠道账单取不到」的处置不同：
   * - 重建：台账已存在，取不到就保留 pending_bill 等下次重试，不制造噪音；
   * - 补齐：是当日新出现的商户，此时渠道账单通常还没出，直接建台账会把
   *   每个商户都变成一条待重试记录。所以补齐阶段在**没有台账**的商户上
   *   要求账单必须取到才建账；取不到就静默跳过，等渠道出账后的下一轮。
   *
   * @param tradeDate 对账日 YYYY-MM-DD
   * @param channel   只对某渠道（手动补跑用），不传则扫全部启用渠道
   * @returns 本轮处理（含重建与新建）的台账数
   */
  async runDaily(tradeDate: string, channel?: PaymentChannel): Promise<number> {
    const channels = channel ? [channel] : [...RECONCILE_ENABLED_CHANNELS];
    const targets = await this.collectTargets(tradeDate, channels);

    let handled = 0;
    for (const target of targets) {
      const result = await this.reconcileOne(target.merchantId, target.channel, tradeDate, {
        requireBill: !target.existing,
      });
      if (result) {
        handled += 1;
      }
    }
    return handled;
  }

  /**
   * 推进未出结论的台账（渠道账单当时没取到的）。
   * 由定时任务调用：只处理 next_retry_at 到期的，避免每轮都白跑。
   */
  async retryOpen(limit = 100): Promise<number> {
    const due = await this.reconciles.find({
      where: {
        status: In([...OPEN_RECONCILE_STATUSES]),
        billDownloaded: false,
        nextRetryAt: LessThanOrEqual(new Date()),
      },
      order: { tradeDate: 'ASC', id: 'ASC' },
      take: limit,
    });

    let done = 0;
    for (const row of due) {
      if (await this.reconcileOne(row.merchantId, row.channel, row.tradeDate, { requireBill: true })) {
        done += 1;
      }
    }
    return done;
  }

  /**
   * 手动补跑指定日期。与定时任务的区别只有两点：
   * 一是允许指定渠道，二是强制重建（不做 requireBill 跳过），
   * 让运营点一次就一定有明确结果。
   */
  async rerun(tradeDate: string, channel?: PaymentChannel): Promise<number> {
    const channels = channel ? [channel] : [...RECONCILE_ENABLED_CHANNELS];
    const targets = await this.collectTargets(tradeDate, channels);

    let handled = 0;
    for (const target of targets) {
      const result = await this.reconcileOne(target.merchantId, target.channel, tradeDate, {
        requireBill: true,
      });
      if (result) {
        handled += 1;
      }
    }
    return handled;
  }

  /** 单商户单渠道单日的对账，返回台账行；被跳过（账单未出）时返回 null。 */
  async reconcileOne(
    merchantId: number,
    channel: PaymentChannel,
    tradeDate: string,
    options: { requireBill: boolean },
  ): Promise<PaymentReconcile | null> {
    // 先取本地账目再下载渠道账单：mock 这类无状态模拟渠道需要用本地账目
    // 来还原账单（详见 BillDownloadContext 的注释）。真实渠道忽略该参数，
    // 顺序对它们没有影响。
    const local = await this.loadLocalLedger(merchantId, channel, tradeDate);

    let bill: ChannelBill;
    try {
      bill = await this.fetchBill(channel, tradeDate, local.rows, merchantId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options.requireBill) {
        // 补齐/手动补跑阶段：账单取不到就不建账，避免给每个商户留一条待重试
        this.logger.debug(`渠道 ${channel} ${tradeDate} 账单未就绪，跳过 merchantId=${merchantId}`);
        return null;
      }
      return this.markPending(merchantId, channel, tradeDate, message);
    }

    const diffs = this.compare(bill.details, local.rows);

    return this.persistReconcile({
      merchantId,
      channel,
      tradeDate,
      bill,
      localCount: local.rows.length,
      localAmountCents: local.amountCents,
      localRefundCents: local.refundCents,
      diffs,
    });
  }

  /* ---------------------------- 数据来源 ---------------------------- */

  /**
   * 取渠道账单。渠道未接入 or 未就绪一律视为「暂时取不到」（BillUnavailableError），
   * 由调用方决定是保留待重试还是跳过——不能在这里决定，因为两种语义都有用。
   */
  private async fetchBill(
    channel: PaymentChannel,
    tradeDate: string,
    localRows: Payment[],
    merchantId: number,
  ): Promise<ChannelBill> {
    const provider = this.registry.resolve(channel);
    if (!provider.isReady()) {
      throw new BillUnavailableError(`渠道 ${channel} 未就绪，无法下载账单`);
    }
    try {
      const bill = await provider.downloadBill(tradeDate, {
        merchantId,
        payments: localRows.map((row) => ({
          paymentNo: row.paymentNo,
          amountCents: row.amountCents,
          tradeNo: row.tradeNo,
          paidAt: row.paidAt,
        })),
      });
      if (!bill.exists) {
        throw new BillUnavailableError(`渠道 ${channel} ${tradeDate} 尚未出账`);
      }
      return bill;
    } catch (error) {
      if (error instanceof BillUnavailableError) {
        throw error;
      }
      throw new BillUnavailableError(
        `下载渠道 ${channel} ${tradeDate} 账单失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 本地账目：当日成功支付单 + 当日成功退款单。
   * 退款单独统计金额，不冲抵交易额——冲抵之后金额差会被退款掩盖。
   */
  private async loadLocalLedger(
    merchantId: number,
    channel: PaymentChannel,
    tradeDate: string,
  ): Promise<{ rows: Payment[]; amountCents: number; refundCents: number }> {
    const dayStart = startOfDay(tradeDate);
    const dayEnd = endOfDay(tradeDate);

    const [rows, refunded] = await Promise.all([
      this.payments.find({
        where: {
          merchantId,
          channel,
          status: PaymentStatus.Succeeded,
          paidAt: Between(dayStart, dayEnd),
        },
      }),
      this.refunds.sum('amountCents', {
        merchantId,
        channel,
        status: RefundStatus.Succeeded,
        succeededAt: Between(dayStart, dayEnd),
      }),
    ]);

    const amountCents = rows.reduce((sum, row) => sum + row.amountCents, 0);
    return { rows, amountCents, refundCents: Number(refunded ?? 0) };
  }

  /** 找出需要对账的（商户 × 渠道）组合：台账已有的 + 当日有成功支付的。 */
  private async collectTargets(
    tradeDate: string,
    channels: readonly PaymentChannel[],
  ): Promise<{ merchantId: number; channel: PaymentChannel; existing: boolean }[]> {
    const [existing, active] = await Promise.all([
      this.reconciles.find({ where: { tradeDate, channel: In([...channels]) } }),
      this.payments.find({
        where: {
          channel: In([...channels]),
          status: PaymentStatus.Succeeded,
          paidAt: Between(startOfDay(tradeDate), endOfDay(tradeDate)),
        },
        select: { merchantId: true, channel: true },
      }),
    ]);

    const map = new Map<string, { merchantId: number; channel: PaymentChannel; existing: boolean }>();
    const key = (merchantId: number, channel: PaymentChannel): string => `${merchantId}:${channel}`;

    for (const row of existing) {
      map.set(key(row.merchantId, row.channel), {
        merchantId: row.merchantId,
        channel: row.channel,
        existing: true,
      });
    }
    for (const row of active) {
      const k = key(row.merchantId, row.channel);
      if (!map.has(k)) {
        map.set(k, { merchantId: row.merchantId, channel: row.channel, existing: false });
      }
    }
    return [...map.values()];
  }

  /* ------------------------------ 比对 ------------------------------ */

  /**
   * 逐笔比对渠道账与本地账。
   *
   * 关联键用 out_trade_no（即本地 payment_no）：它是我们自己生成的，
   * 渠道只做回填，比渠道交易号可靠——渠道交易号在部分渠道会因重试而变化。
   *
   * 金额差异按「渠道 - 本地」记，正负号有意义：正数说明渠道多记了钱。
   */
  private compare(channelDetails: ChannelBillDetail[], localRows: Payment[]): DiffDraft[] {
    const localByNo = new Map(localRows.map((row) => [row.paymentNo, row] as const));
    const seen = new Set<string>();
    const diffs: DiffDraft[] = [];

    for (const detail of channelDetails) {
      if (seen.has(detail.outTradeNo)) {
        diffs.push({
          diffType: ReconcileDiffType.DuplicateEntry,
          outTradeNo: detail.outTradeNo,
          paymentId: localByNo.get(detail.outTradeNo)?.id ?? null,
          channelAmountCents: detail.amountCents,
          localAmountCents: null,
          diffAmountCents: 0,
          channelTradeNo: detail.transactionId,
          localTradeNo: null,
          remark: '渠道账单中该支付单号出现多次，疑似重复记账，请向渠道核实',
          channelPaidAt: detail.paidAt,
          rawChannel: { ...detail },
        });
        continue;
      }
      seen.add(detail.outTradeNo);

      const local = localByNo.get(detail.outTradeNo);
      if (!local) {
        diffs.push({
          diffType: ReconcileDiffType.MissingLocal,
          outTradeNo: detail.outTradeNo,
          paymentId: null,
          channelAmountCents: detail.amountCents,
          localAmountCents: null,
          diffAmountCents: detail.amountCents,
          channelTradeNo: detail.transactionId,
          localTradeNo: null,
          remark: '渠道有记账但本地无对应支付单，疑似本地丢单或渠道串单',
          channelPaidAt: detail.paidAt,
          rawChannel: { ...detail },
        });
        continue;
      }

      if (detail.amountCents !== local.amountCents) {
        diffs.push({
          diffType: ReconcileDiffType.AmountMismatch,
          outTradeNo: detail.outTradeNo,
          paymentId: local.id,
          channelAmountCents: detail.amountCents,
          localAmountCents: local.amountCents,
          diffAmountCents: detail.amountCents - local.amountCents,
          channelTradeNo: detail.transactionId,
          localTradeNo: local.tradeNo,
          remark: `金额不一致：渠道 ${(detail.amountCents / 100).toFixed(2)} 元，本地 ${(local.amountCents / 100).toFixed(2)} 元`,
          channelPaidAt: detail.paidAt,
          rawChannel: { ...detail },
        });
        continue;
      }

      // 金额一致，再看渠道交易号是否回填一致（仅当双方都有值时才有意义）
      if (detail.transactionId && local.tradeNo && detail.transactionId !== local.tradeNo) {
        diffs.push({
          diffType: ReconcileDiffType.TradeNoMismatch,
          outTradeNo: detail.outTradeNo,
          paymentId: local.id,
          channelAmountCents: detail.amountCents,
          localAmountCents: local.amountCents,
          diffAmountCents: 0,
          channelTradeNo: detail.transactionId,
          localTradeNo: local.tradeNo,
          remark: '渠道交易号与本地不一致，本地可能被另一笔覆盖',
          channelPaidAt: detail.paidAt,
          rawChannel: { ...detail },
        });
      }
    }

    for (const local of localRows) {
      if (seen.has(local.paymentNo)) {
        continue;
      }
      diffs.push({
        diffType: ReconcileDiffType.MissingChannel,
        outTradeNo: local.paymentNo,
        paymentId: local.id,
        channelAmountCents: null,
        localAmountCents: local.amountCents,
        diffAmountCents: -local.amountCents,
        channelTradeNo: null,
        localTradeNo: local.tradeNo,
        remark: '本地记为成功但渠道账中无此笔，需向渠道发起查询',
        channelPaidAt: null,
        rawChannel: null,
      });
    }

    return diffs;
  }

  /* ------------------------------ 落库 ------------------------------ */

  private async persistReconcile(input: {
    merchantId: number;
    channel: PaymentChannel;
    tradeDate: string;
    bill: ChannelBill;
    localCount: number;
    localAmountCents: number;
    localRefundCents: number;
    diffs: DiffDraft[];
  }): Promise<PaymentReconcile> {
    const { merchantId, channel, tradeDate, bill, diffs } = input;
    const channelAmountCents = bill.details.reduce((sum, row) => sum + row.amountCents, 0);
    const channelFeeCents = bill.details.reduce((sum, row) => sum + row.feeCents, 0);
    const diffAmountCents = diffs.reduce((sum, row) => sum + Math.abs(row.diffAmountCents), 0);
    const status = diffs.length > 0 ? ReconcileStatus.Mismatch : ReconcileStatus.Balanced;

    const existing = await this.reconciles.findOne({ where: { merchantId, channel, tradeDate } });
    const row = existing ?? this.reconciles.create({ merchantId });
    row.reconcileNo = existing?.reconcileNo ?? generateReconcileNo(startOfDay(tradeDate));
    row.channel = channel;
    row.tradeDate = tradeDate;
    row.channelCount = bill.details.length;
    row.channelAmountCents = channelAmountCents;
    row.channelFeeCents = channelFeeCents;
    row.localCount = input.localCount;
    row.localAmountCents = input.localAmountCents;
    row.localRefundCents = input.localRefundCents;
    row.diffCount = diffs.length;
    row.diffAmountCents = diffAmountCents;
    row.status = status;
    row.billDownloaded = true;
    row.billFetchedAt = new Date();
    row.retryCount = 0;
    row.nextRetryAt = null;
    row.reconciledAt = new Date();
    row.failureReason = null;

    const saved = await this.reconciles.save(row);

    // 差异明细整体替换：重跑对账是常规操作，不能累积出重复明细。
    // 唯一索引 (reconcile_id, channel, out_trade_no) 是最后一道防线。
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(PaymentReconcileDetail, { reconcileId: saved.id });
      if (diffs.length === 0) {
        return;
      }
      await manager.save(
        diffs.map((diff) =>
          manager.create(PaymentReconcileDetail, {
            reconcileId: saved.id,
            merchantId,
            channel,
            diffType: diff.diffType,
            outTradeNo: diff.outTradeNo,
            paymentId: diff.paymentId,
            channelAmountCents: diff.channelAmountCents,
            localAmountCents: diff.localAmountCents,
            diffAmountCents: diff.diffAmountCents,
            channelTradeNo: diff.channelTradeNo,
            localTradeNo: diff.localTradeNo,
            remark: diff.remark,
            channelPaidAt: diff.channelPaidAt,
            rawChannel: diff.rawChannel,
          }),
        ),
      );
    });

    this.logger.log(
      `对账完成 merchantId=${merchantId} ${channel} ${tradeDate} 状态=${status} ` +
        `渠道 ${bill.details.length} 笔 / 本地 ${input.localCount} 笔，差异 ${diffs.length} 笔`,
    );
    return saved;
  }

  /** 渠道账单未取到：台账保留并排下一次重试，超过上限转 failed 交人工。 */
  private async markPending(
    merchantId: number,
    channel: PaymentChannel,
    tradeDate: string,
    reason: string,
  ): Promise<PaymentReconcile> {
    const existing = await this.reconciles.findOne({ where: { merchantId, channel, tradeDate } });
    const row = existing ?? this.reconciles.create({ merchantId });
    row.reconcileNo = existing?.reconcileNo ?? generateReconcileNo(startOfDay(tradeDate));
    row.channel = channel;
    row.tradeDate = tradeDate;
    row.billDownloaded = false;
    row.retryCount = (existing?.retryCount ?? 0) + 1;

    if (row.retryCount >= RECONCILE_MAX_RETRY) {
      row.status = ReconcileStatus.Failed;
      row.nextRetryAt = null;
    } else {
      row.status = ReconcileStatus.PendingBill;
      // 退避 10 分钟：渠道账单出账是小时级的，重试再密也没用
      row.nextRetryAt = new Date(Date.now() + 10 * 60 * 1000);
    }
    row.failureReason = reason.slice(0, 255);

    const saved = await this.reconciles.save(row);
    this.logger.warn(
      `对账待重试 merchantId=${merchantId} ${channel} ${tradeDate} retry=${row.retryCount}/${RECONCILE_MAX_RETRY}: ${reason}`,
    );
    return saved;
  }

  /* ------------------------------ 查询 ------------------------------ */

  /** 台账分页（平台视角，跨租户）。 */
  async page(query: {
    merchantId?: number;
    channel?: PaymentChannel;
    status?: ReconcileStatus;
    from?: string;
    to?: string;
    page: number;
    pageSize: number;
  }): Promise<{ list: PaymentReconcile[]; total: number; page: number; pageSize: number }> {
    const where: FindOptionsWhere<PaymentReconcile> = {
      ...(query.merchantId ? { merchantId: query.merchantId } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    if (query.from && query.to) {
      where.tradeDate = Between(query.from, query.to);
    } else if (query.from) {
      where.tradeDate = MoreThanOrEqual(query.from);
    } else if (query.to) {
      where.tradeDate = LessThanOrEqual(query.to);
    }

    const [list, total] = await this.reconciles.findAndCount({
      where,
      order: { tradeDate: 'DESC', id: 'DESC' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    return { list, total, page: query.page, pageSize: query.pageSize };
  }

  async findByNo(reconcileNo: string): Promise<PaymentReconcile> {
    const row = await this.reconciles.findOne({ where: { reconcileNo } });
    if (!row) {
      throw BusinessException.notFound('对账台账不存在');
    }
    return row;
  }

  async detailsOf(reconcileId: number): Promise<PaymentReconcileDetail[]> {
    return this.details.find({
      where: { reconcileId },
      order: { id: 'ASC' },
    });
  }

  /** 对账概况：最近一次对账日、未平账数、累计差异金额。 */
  async summary(): Promise<{
    lastTradeDate: string | null;
    balancedCount: number;
    mismatchCount: number;
    pendingCount: number;
    failedCount: number;
    diffAmount: number;
  }> {
    const [latest, balancedCount, mismatchCount, pendingCount, failedCount, diffSum] =
      await Promise.all([
        this.reconciles.findOne({ where: {}, order: { tradeDate: 'DESC', id: 'DESC' } }),
        this.reconciles.count({ where: { status: ReconcileStatus.Balanced } }),
        this.reconciles.count({ where: { status: ReconcileStatus.Mismatch } }),
        this.reconciles.count({ where: { status: In([...OPEN_RECONCILE_STATUSES]) } }),
        this.reconciles.count({ where: { status: ReconcileStatus.Failed } }),
        this.reconciles.sum('diffAmountCents', { status: ReconcileStatus.Mismatch }),
      ]);

    return {
      lastTradeDate: latest ? formatDateKey(latest.tradeDate) : null,
      balancedCount,
      mismatchCount,
      pendingCount,
      failedCount,
      diffAmount: Number(diffSum ?? 0) / 100,
    };
  }
}
