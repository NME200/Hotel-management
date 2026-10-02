import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import { buildPageResult, type PageResult } from '../../../common/dto/page-result.dto';
import { toYuan } from '../../../common/utils/money.util';
import { Merchant } from '../../../database/entities/merchant.entity';
import { PaymentReconcile } from '../../../database/entities/payment-reconcile.entity';
import { PaymentReconcileDetail } from '../../../database/entities/payment-reconcile-detail.entity';
import { PaymentChannel } from '../constants/payment.constant';
import type {
  PlatformReconcileQueryDto,
  RunReconcileDto,
} from '../dto/platform-reconcile-query.dto';
import type {
  PlatformReconcileDetail,
  PlatformReconcileDetailItem,
  PlatformReconcileItem,
  PlatformReconcileSummary,
  RunReconcileResult,
} from '../models/platform-reconcile.model';
import { PaymentReconcileService } from './payment-reconcile.service';

/**
 * 平台端对账视图。
 *
 * 与平台支付流水、平台分账一致：**刻意不复用 TenantRepo**。
 * 平台视角天然跨租户，强制并 merchantId 反而表达不了"全平台对账情况"；
 * 访问边界由 platform:payment:read 权限点兜住。
 */
@Injectable()
export class PlatformReconcileService {
  constructor(
    @InjectRepository(Merchant) private readonly merchants: Repository<Merchant>,
    private readonly reconcileService: PaymentReconcileService,
  ) {}

  async page(query: PlatformReconcileQueryDto): Promise<PageResult<PlatformReconcileItem>> {
    const result = await this.reconcileService.page(query);
    const items = await this.decorate(result.list);
    return buildPageResult(items, result.total, result.page, result.pageSize);
  }

  /** 台账详情 + 差异明细。 */
  async detail(reconcileNo: string): Promise<PlatformReconcileDetail> {
    const row = await this.reconcileService.findByNo(reconcileNo);
    const [item] = await this.decorate([row]);
    const details = await this.reconcileService.detailsOf(row.id);
    return {
      reconcile: item,
      details: details.map((detail) => this.toDetailItem(detail)),
    };
  }

  summary(): Promise<PlatformReconcileSummary> {
    return this.reconcileService.summary();
  }

  /** 手动补跑：强制重建指定日期的台账（含渠道账单取不到时也建账等重试）。 */
  async run(dto: RunReconcileDto): Promise<RunReconcileResult> {
    const handled = await this.reconcileService.rerun(dto.tradeDate, dto.channel);
    return {
      tradeDate: dto.tradeDate,
      channel: dto.channel ?? null,
      handled,
    };
  }

  /* ------------------------------ 内部 ------------------------------ */

  private async decorate(rows: PaymentReconcile[]): Promise<PlatformReconcileItem[]> {
    if (rows.length === 0) {
      return [];
    }
    const merchantIds = [...new Set(rows.map((row) => row.merchantId))];
    const merchants = merchantIds.length
      ? await this.merchants.find({ where: { id: In(merchantIds) } })
      : [];
    const merchantMap = new Map(merchants.map((item) => [item.id, item] as const));

    return rows.map((row) => {
      const merchant = merchantMap.get(row.merchantId);
      return {
        id: row.id,
        reconcileNo: row.reconcileNo,
        merchantId: row.merchantId,
        merchantCode: merchant?.code ?? '-',
        merchantName: merchant?.name ?? '-',
        channel: row.channel as PaymentChannel,
        tradeDate: row.tradeDate,
        channelCount: row.channelCount,
        channelAmount: toYuan(row.channelAmountCents),
        channelFee: toYuan(row.channelFeeCents),
        localCount: row.localCount,
        localAmount: toYuan(row.localAmountCents),
        localRefund: toYuan(row.localRefundCents),
        diffCount: row.diffCount,
        diffAmount: toYuan(row.diffAmountCents),
        status: row.status,
        billDownloaded: row.billDownloaded,
        billFetchedAt: row.billFetchedAt,
        retryCount: row.retryCount,
        nextRetryAt: row.nextRetryAt,
        reconciledAt: row.reconciledAt,
        failureReason: row.failureReason,
        createdAt: row.createdAt,
      };
    });
  }

  private toDetailItem(row: PaymentReconcileDetail): PlatformReconcileDetailItem {
    return {
      id: row.id,
      reconcileId: row.reconcileId,
      merchantId: row.merchantId,
      channel: row.channel,
      diffType: row.diffType,
      outTradeNo: row.outTradeNo,
      paymentId: row.paymentId,
      channelAmount: row.channelAmountCents === null ? null : toYuan(row.channelAmountCents),
      localAmount: row.localAmountCents === null ? null : toYuan(row.localAmountCents),
      diffAmount: toYuan(row.diffAmountCents),
      channelTradeNo: row.channelTradeNo,
      localTradeNo: row.localTradeNo,
      remark: row.remark,
      channelPaidAt: row.channelPaidAt,
    };
  }
}
