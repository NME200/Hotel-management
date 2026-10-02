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
import { toSkipTake } from '../../../common/dto/page-query.dto';
import { buildPageResult, type PageResult } from '../../../common/dto/page-result.dto';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { endOfDay, startOfDay } from '../../../common/utils/date.util';
import { likePattern } from '../../../common/utils/like.util';
import { toYuan } from '../../../common/utils/money.util';
import { Merchant } from '../../../database/entities/merchant.entity';
import { Order } from '../../../database/entities/order.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { ProfitShare } from '../../../database/entities/profit-share.entity';
import {
  OPEN_PROFIT_SHARE_STATUSES,
  ProfitShareReceiver,
  ProfitShareStatus,
} from '../constants/profit-share.constant';
import type { PlatformProfitShareQueryDto } from '../dto/platform-profit-share-query.dto';
import type {
  PlatformProfitShareItem,
  PlatformProfitShareSummary,
} from '../models/platform-profit-share.model';
import { PaymentProfitShareService } from './payment-profit-share.service';

/**
 * 平台端分账视图。
 *
 * 分账单在库里是「一支付单两条记录」（platform + merchant），
 * 但业务上运营想看的是「这一单我抽了多少佣」，所以这里按 paymentId 聚合成一行
 * 返回：平台抽佣 + 商户结算 = 支付额。
 *
 * 分页基准取平台侧记录（每支付单恰好一条），再补齐商户侧。
 *
 * 与平台支付流水一样刻意不复用 TenantRepo：平台视角天然跨租户，
 * 访问边界由 platform:payment:read 权限点兜住。
 */
@Injectable()
export class PlatformProfitShareService {
  constructor(
    @InjectRepository(ProfitShare) private readonly shares: Repository<ProfitShare>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Merchant) private readonly merchants: Repository<Merchant>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly profitShareService: PaymentProfitShareService,
  ) {}

  async page(query: PlatformProfitShareQueryDto): Promise<PageResult<PlatformProfitShareItem>> {
    const where = await this.buildWhere(query);
    const { skip, take } = toSkipTake(query.page, query.pageSize);

    const [rows, total] = await this.shares.findAndCount({
      where,
      order: { id: 'DESC' },
      skip,
      take,
    });

    const list = await this.buildItems(rows);
    return buildPageResult(list, total, query.page, query.pageSize);
  }

  /** 分账概况：累计抽佣、今日抽佣、待解冻、已解冻、失败笔数。 */
  async summary(): Promise<PlatformProfitShareSummary> {
    const platformWhere: FindOptionsWhere<ProfitShare> = {
      receiverType: ProfitShareReceiver.Platform,
    };
    const todayRange = Between(startOfDay(new Date()), endOfDay(new Date()));

    const [
      totalCommission,
      todayCommission,
      frozenCount,
      unfrozenCount,
      failedCount,
      pendingCount,
    ] = await Promise.all([
      this.shares.sum('amountCents', platformWhere),
      this.shares.sum('amountCents', { ...platformWhere, createdAt: todayRange }),
      this.shares.count({ where: { ...platformWhere, status: ProfitShareStatus.Frozen } }),
      this.shares.count({ where: { ...platformWhere, status: ProfitShareStatus.Unfrozen } }),
      this.shares.count({ where: { ...platformWhere, status: ProfitShareStatus.Failed } }),
      this.shares.count({
        where: { ...platformWhere, status: In([...OPEN_PROFIT_SHARE_STATUSES]) },
      }),
    ]);

    return {
      totalCommission: toYuan(Number(totalCommission ?? 0)),
      todayCommission: toYuan(Number(todayCommission ?? 0)),
      frozenCount,
      unfrozenCount,
      failedCount,
      pendingCount,
    };
  }

  /** 单笔分账详情：按 shareNo 定位支付单，返回该单的合并视图。 */
  async detail(shareNo: string): Promise<PlatformProfitShareItem> {
    const anchor = await this.shares.findOne({ where: { shareNo } });
    if (!anchor) {
      throw BusinessException.notFound('分账单不存在');
    }
    const rows = await this.shares.find({
      where: { paymentId: anchor.paymentId, receiverType: ProfitShareReceiver.Platform },
      order: { id: 'ASC' },
    });
    const [item] = await this.buildItems(rows.length ? rows : [anchor]);
    return item;
  }

  /* ------------------------------ 内部 ------------------------------ */

  private async buildWhere(query: PlatformProfitShareQueryDto): Promise<FindOptionsWhere<ProfitShare>> {
    const where: FindOptionsWhere<ProfitShare> = {
      receiverType: ProfitShareReceiver.Platform,
      ...(query.merchantId ? { merchantId: query.merchantId } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    if (query.from && query.to) {
      where.unfreezeAt = Between(startOfDay(query.from), endOfDay(query.to));
    } else if (query.from) {
      where.unfreezeAt = MoreThanOrEqual(startOfDay(query.from));
    } else if (query.to) {
      where.unfreezeAt = LessThanOrEqual(endOfDay(query.to));
    }

    if (query.orderNo) {
      const order = await this.orders.findOne({
        where: { orderNo: query.orderNo },
        select: { id: true },
      });
      where.orderId = order?.id ?? -1;
    }

    const keyword = query.keyword?.trim();
    if (keyword) {
      const merchantIds = await this.merchantIdsByKeyword(keyword);
      where.merchantId = merchantIds.length ? In(merchantIds) : -1;
    }

    return where;
  }

  private async merchantIdsByKeyword(keyword: string): Promise<number[]> {
    const matched = await this.merchants.find({
      where: [{ name: Like(likePattern(keyword)) }, { code: Like(likePattern(keyword)) }],
      select: { id: true },
    });
    return matched.map((item) => item.id);
  }

  /** 把平台侧行补齐对应的商户侧行，组装成业务视图（保持入参顺序）。 */
  private async buildItems(rows: ProfitShare[]): Promise<PlatformProfitShareItem[]> {
    if (rows.length === 0) {
      return [];
    }
    const paymentIds = [...new Set(rows.map((row) => row.paymentId))];
    const merchantIds = [...new Set(rows.map((row) => row.merchantId))];

    // 必须取"该批支付单的全部分账单"（平台侧 + 商户侧）再聚合：
    // 入参 rows 只是分页后的平台侧记录，若直接拿它求和，总额会变成抽佣额。
    const [allShares, merchants, payments] = await Promise.all([
      this.shares.find({ where: { paymentId: In(paymentIds) } }),
      merchantIds.length ? this.merchants.find({ where: { id: In(merchantIds) } }) : [],
      this.payments.find({ where: { id: In(paymentIds) } }),
    ]);

    const grouped = new Map<number, ProfitShare[]>();
    for (const share of allShares) {
      const bucket = grouped.get(share.paymentId) ?? [];
      bucket.push(share);
      grouped.set(share.paymentId, bucket);
    }
    const merchantMap = new Map(merchants.map((m) => [m.id, m] as const));
    const paymentMap = new Map(payments.map((p) => [p.id, p] as const));

    // 按入参顺序（已按 id DESC 排好）逐条生成视图，确保分页顺序稳定。
    // 商户与订单信息优先取分账单自带的冗余字段——即使原支付单已被清理，
    // 分账账目仍然要能查得到（这是记账数据，不该被关联表的存在性绑架）。
    const items: PlatformProfitShareItem[] = [];
    for (const row of rows) {
      const bucket = grouped.get(row.paymentId) ?? [row];
      const platform = bucket.find((r) => r.receiverType === ProfitShareReceiver.Platform);
      const merchant = bucket.find((r) => r.receiverType === ProfitShareReceiver.Merchant);
      const total = bucket.reduce((sum, r) => sum + r.amountCents, 0);
      const payment = paymentMap.get(row.paymentId);
      const merchantId = row.merchantId;
      const merchantInfo = merchantMap.get(merchantId);
      const primary = platform ?? row;
      items.push({
        shareNo: primary.shareNo,
        paymentId: primary.paymentId,
        paymentNo: payment?.paymentNo ?? null,
        merchantId,
        merchantCode: merchantInfo?.code ?? '-',
        merchantName: merchantInfo?.name ?? '-',
        orderId: primary.orderId,
        channel: primary.channel,
        totalAmount: toYuan(total),
        platformAmount: toYuan(platform?.amountCents ?? 0),
        merchantAmount: toYuan(merchant?.amountCents ?? 0),
        rate: platform?.rate ?? merchant?.rate ?? null,
        status: primary.status,
        platformStatus: platform?.status ?? primary.status,
        merchantStatus: merchant?.status ?? primary.status,
        unfreezeAt: primary.unfreezeAt,
        unfrozenAt: platform?.unfrozenAt ?? merchant?.unfrozenAt ?? null,
        failureReason: primary.failureReason,
        createdAt: primary.createdAt,
      });
    }
    return items;
  }
}
