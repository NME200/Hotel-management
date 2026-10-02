import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { PaymentChannel, PaymentStatus, RefundStatus } from '../constants/payment.constant';
import { ProfitShareStatus } from '../constants/profit-share.constant';
import type { ConfigRoot } from '../../../config/configuration';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../../common/exceptions/business.exception';
import {
  type BillDownloadContext,
  type ChannelBill,
  type ChannelProfitShareResult,
  type ChannelRefundResult,
  type ChannelTradeState,
  type ChannelUnfreezeResult,
  type CreatePaymentCommand,
  type CreatedPaymentResult,
  type NormalizedNotify,
  type PaymentProvider,
  type ProfitShareCommand,
  readRawBody,
} from './payment-provider.interface';
import type { Payment } from '../../../database/entities/payment.entity';
import type { PaymentRefund } from '../../../database/entities/payment-refund.entity';
import type { ProfitShare } from '../../../database/entities/profit-share.entity';
import type { NotifyType } from '../constants/payment.constant';

interface MockTrade {
  tradeNo: string;
  amountCents: number;
  succeeded: boolean;
  paidAt: Date | null;
}

/** 模拟渠道内存里的分账记录，解冻时据此校验状态。 */
interface MockShare {
  frozen: boolean;
  amountCents: number;
  unfrozenAt: Date | null;
}

/** 合成账单时的一笔来源（来自调用方传入的本地账目，或退回内存 trades）。 */
interface MockBillSource {
  outTradeNo: string;
  transactionId: string | null;
  amountCents: number;
  paidAt: Date | null;
}

/**
 * 模拟渠道：用于资质未就绪时把「下单 → 拉起支付 → 异步通知 → 查单 → 关单 → 退款」
 * 整条链路跑通，业务层走的代码与真渠道完全一致。
 *
 * 分账与账单同样在此模拟：分账直接置为 frozen，解冻直接成功；
 * 账单按本地支付单合成（不查库，靠调用方传入的 query 结果），
 * 便于在测试里制造可控差异来验证对账逻辑。
 *
 * 仅在非生产且 MOCK_PAY_ENABLED=True 时就绪；生产环境 isReady() 恒为 false，
 * 下单与通知入口都会直接拒绝。
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly channel = PaymentChannel.Mock;

  private readonly trades = new Map<string, MockTrade>();
  private readonly shares = new Map<string, MockShare>();

  constructor(private readonly configService: ConfigService<ConfigRoot, true>) {}

  private get enabled(): boolean {
    return this.configService.get('app', { infer: true }).payment.mock.enabled;
  }

  isReady(): boolean {
    return this.enabled;
  }

  private assertReady(): void {
    if (!this.enabled) {
      throw BusinessException.forbidden('模拟支付渠道未启用');
    }
  }

  async create(command: CreatePaymentCommand): Promise<CreatedPaymentResult> {
    this.assertReady();
    const { payment } = command;
    this.trades.set(payment.paymentNo, {
      tradeNo: `MOCK${Date.now()}${randomUUID().slice(0, 6)}`,
      amountCents: payment.amountCents,
      succeeded: false,
      paidAt: null,
    });

    return {
      status: PaymentStatus.Paying,
      tradeNo: null,
      prepayId: `mock_${payment.paymentNo}`,
      payParams: {
        paymentNo: payment.paymentNo,
        // 客户端（或测试脚本）调这个地址模拟渠道异步通知
        confirmUrl: `/api/v1/notify/mock?paymentNo=${payment.paymentNo}`,
        mock: 'true',
      },
      paidAt: null,
    };
  }

  async query(payment: Payment): Promise<ChannelTradeState> {
    this.assertReady();
    const trade = this.trades.get(payment.paymentNo);
    if (!trade) {
      return {
        status: PaymentStatus.Paying,
        tradeNo: null,
        amountCents: payment.amountCents,
        paidAt: null,
        raw: { reason: '模拟渠道无该笔交易记录' },
      };
    }

    return {
      status: trade.succeeded ? PaymentStatus.Succeeded : PaymentStatus.Paying,
      tradeNo: trade.tradeNo,
      amountCents: trade.amountCents,
      paidAt: trade.paidAt,
      raw: { ...trade },
    };
  }

  async close(payment: Payment): Promise<void> {
    this.assertReady();
    this.trades.delete(payment.paymentNo);
  }

  async refund(refund: PaymentRefund, payment: Payment): Promise<ChannelRefundResult> {
    this.assertReady();
    const trade = this.trades.get(payment.paymentNo);
    if (!trade || !trade.succeeded) {
      throw BusinessException.badRequest('模拟交易尚未支付成功，无法退款');
    }
    return {
      status: RefundStatus.Succeeded,
      channelRefundId: `MOCKRF${Date.now()}`,
      amountCents: refund.amountCents,
      raw: { refundNo: refund.refundNo, instant: true },
    };
  }

  /**
   * 模拟通知：body 支持 { paymentNo | refundNo, amountCents?, success?, tradeNo? }。
   * 真实渠道的验签/解密在各自 provider 内完成，这里没有可信签名可言，
   * 因此整个 provider 在生产环境直接关闭。
   */
  async parseNotify(request: Request): Promise<NormalizedNotify> {
    this.assertReady();
    const body = (request.body ?? {}) as Record<string, unknown>;
    const paymentNo = typeof body.paymentNo === 'string' ? body.paymentNo : null;
    const refundNo = typeof body.refundNo === 'string' ? body.refundNo : null;
    if (!paymentNo && !refundNo) {
      throw BusinessException.badRequest('模拟通知缺少 paymentNo 或 refundNo');
    }

    const key = paymentNo ?? (refundNo as string);
    const trade = this.trades.get(key);
    const succeeded = body.success !== false;
    const amountCents =
      typeof body.amountCents === 'number'
        ? Math.round(body.amountCents)
        : (trade?.amountCents ?? 0);

    if (trade) {
      trade.succeeded = succeeded;
      trade.paidAt = succeeded ? new Date() : null;
    }

    const type: NotifyType = refundNo ? 'refund' : 'payment';
    return {
      // 通知 ID 做成确定性的，重复模拟同一笔通知时会撞唯一索引，
      // 从而真实地走一遍"重复通知去重"分支
      notifyId: `MOCK-${key}-${succeeded ? 'ok' : 'fail'}`,
      type,
      paymentNo: paymentNo ?? refundNo,
      refundNo,
      tradeNo: typeof body.tradeNo === 'string' ? body.tradeNo : (trade?.tradeNo ?? `MOCK${key}`),
      amountCents,
      succeeded,
      paidAt: succeeded ? new Date() : null,
      payload: { ...body, channel: this.channel },
    };
  }

  buildAck(error?: string): { httpStatus: number; body: unknown } {
    return error
      ? { httpStatus: 200, body: { code: 'FAIL', message: error } }
      : { httpStatus: 200, body: { code: 'SUCCESS' } };
  }

  /**
   * 模拟分账：直接把每笔分账单登记为「已冻结」，返回渠道分账单号。
   * 真实渠道（微信服务商分账 / 支付宝分账）在此处调用对应接口并回填 channelShareId。
   */
  async profitShare(command: ProfitShareCommand): Promise<ChannelProfitShareResult> {
    this.assertReady();
    const { payment, shares } = command;
    const ids: string[] = [];
    for (const share of shares) {
      const channelShareId = `MOCKSH${Date.now()}${randomUUID().slice(0, 6)}`;
      this.shares.set(channelShareId, {
        frozen: true,
        amountCents: share.amountCents,
        unfrozenAt: null,
      });
      ids.push(channelShareId);
    }

    return {
      status: ProfitShareStatus.Frozen,
      // 单笔分账场景（平台抽佣）下返回首笔渠道号，业务侧按 share 逐条回填
      channelShareId: ids[0] ?? null,
      raw: {
        paymentNo: payment.paymentNo,
        shareNos: shares.map((s) => s.shareNo),
        channelShareIds: ids,
        frozen: true,
      },
    };
  }

  /**
   * 模拟解冻：把分账单标记为已解冻。
   *
   * 内存里的 shares 只在单个进程内有效，多进程/重启后会丢；为了让解冻链路
   * 在任何运行方式下都可验证，这里以「分账单已带渠道分账单号」为解冻成功的
   * 依据，而不是查内存表。没有渠道号的单才判失败，用于验证失败重试分支。
   */
  async unfreezeShare(share: ProfitShare): Promise<ChannelUnfreezeResult> {
    this.assertReady();

    if (!share.channelShareId) {
      return {
        status: ProfitShareStatus.Failed,
        unfrozenAt: null,
        raw: { reason: '模拟渠道未找到该笔冻结分账', shareNo: share.shareNo },
      };
    }

    const record = this.shares.get(share.channelShareId);
    const unfrozenAt = new Date();
    if (record) {
      record.frozen = false;
      record.unfrozenAt = unfrozenAt;
    }

    return {
      status: ProfitShareStatus.Unfrozen,
      unfrozenAt,
      raw: {
        channelShareId: share.channelShareId,
        shareNo: share.shareNo,
        amountCents: record?.amountCents ?? share.amountCents,
        unfrozenAt: unfrozenAt.toISOString(),
      },
    };
  }

  /**
   * 模拟账单下载：合成一份结构上与真实渠道一致的账单。
   *
   * 这个 mock 是无状态的：内存 trades 只在单进程内有效，账单下载往往发生在
   * 另一个进程（定时对账任务）或重启之后，那时内存里根本没有交易。
   * 要是因此返回空账单，本地每笔成功支付都会被判成 `missing_channel` 假差异。
   * 所以优先用调用方传入的本地参考账目来还原账单。
   *
   * 为了让对账逻辑可验证，这里故意做了可控差异：
   * - 金额能被 100 整除的订单，渠道金额比本地多 1 分（模拟渠道侧多扣/少扣）
   * - 渠道手续费按 0.6% 取整（真实渠道按各自费率计算）
   * 结果完全由传入的本地账目决定，因此同一份数据重复调用结果一致。
   */
  async downloadBill(billDate: string, context?: BillDownloadContext): Promise<ChannelBill> {
    this.assertReady();

    // 首选调用方给的本地账目；没有时才退回内存 trades
    const sources: MockBillSource[] = context
      ? context.payments.map((item) => ({
          outTradeNo: item.paymentNo,
          transactionId: item.tradeNo ?? `MOCK${item.paymentNo}`,
          amountCents: item.amountCents,
          paidAt: item.paidAt,
        }))
      : [...this.trades.entries()]
          .filter(([, trade]) => trade.succeeded && trade.paidAt)
          .map(([paymentNo, trade]) => ({
            outTradeNo: paymentNo,
            transactionId: trade.tradeNo,
            amountCents: trade.amountCents,
            paidAt: trade.paidAt as Date,
          }));

    const details = sources
      .filter((source) => source.paidAt && this.localDateKey(source.paidAt) === billDate)
      .map((source) => ({
        outTradeNo: source.outTradeNo,
        transactionId: source.transactionId,
        // 可控差异：金额整除 100 分的订单，渠道侧金额 +1 分
        amountCents:
          source.amountCents % 100 === 0 ? source.amountCents + 1 : source.amountCents,
        feeCents: Math.round(source.amountCents * 0.006),
        paidAt: source.paidAt as Date,
      }));

    return {
      billDate,
      exists: details.length > 0,
      details,
    };
  }

  /** 渠道账单按商户当地自然日切分（模拟渠道用同日历日）。 */
  private localDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
