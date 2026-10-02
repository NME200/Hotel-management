import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThanOrEqual, type Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { generateShareNo } from '../../../common/utils/id.util';
import { Payment } from '../../../database/entities/payment.entity';
import { ProfitShare } from '../../../database/entities/profit-share.entity';
import {
  OPEN_PROFIT_SHARE_STATUSES,
  PROFIT_SHARE_MAX_RETRY,
  PROFIT_SHARE_UNFREEZE_DAYS,
  ProfitShareReceiver,
  ProfitShareStatus,
} from '../constants/profit-share.constant';
import { PaymentProviderRegistry } from '../providers/payment-provider.registry';

/** 平台抽佣的固定接收方枚举：平台自留 + 商户待结算。 */
const PLATFORM_RECEIVER = ProfitShareReceiver.Platform;
const MERCHANT_RECEIVER = ProfitShareReceiver.Merchant;

@Injectable()
export class PaymentProfitShareService {
  private readonly logger = new Logger(PaymentProfitShareService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ProfitShare) private readonly shareRepository: Repository<ProfitShare>,
    private readonly registry: PaymentProviderRegistry,
  ) {}

  /* --------------------------- 生成分账单 --------------------------- */

  /**
   * 支付成功后按商户配置的抽佣比例生成分账单。
   *
   * 只在 payment.needProfitSharing 为 true 时执行；金额按「支付额 × 抽佣比例」
   * 取整（四舍五入到分），商户接收方拿剩余部分，保证两笔之和恰好等于支付额，
   * 避免出现 1 分的对不上账。
   *
   * 幂等由 idx_profit_share_payment_id_receiver_type 唯一索引兜底：
   * 并发或重放时直接跳过，不会重复抽佣。
   */
  async generateForPayment(
    merchantId: number,
    payment: Payment,
    profitShareRate: number | null,
  ): Promise<ProfitShare[]> {
    if (!payment.needProfitSharing || profitShareRate === null || profitShareRate <= 0) {
      return [];
    }

    const platformAmount = Math.round(payment.amountCents * profitShareRate);
    if (platformAmount <= 0 || platformAmount >= payment.amountCents) {
      // 比例异常（配置错误）时不动账，只留日志让人发现
      this.logger.warn(
        `分账比例异常，跳过生成 paymentNo=${payment.paymentNo} rate=${profitShareRate} 平台=${platformAmount}`,
      );
      return [];
    }

    const unfreezeAt = this.unfreezeDate(new Date());
    const rows: ProfitShare[] = [
      this.buildRow(merchantId, payment, PLATFORM_RECEIVER, platformAmount, profitShareRate, unfreezeAt),
      this.buildRow(
        merchantId,
        payment,
        MERCHANT_RECEIVER,
        payment.amountCents - platformAmount,
        profitShareRate,
        unfreezeAt,
      ),
    ];

    const saved: ProfitShare[] = [];
    for (const row of rows) {
      try {
        saved.push(await this.shareRepository.save(row));
      } catch (error) {
        // 唯一索引冲突说明这单已经抽过佣，跳过即可
        this.logger.warn(
          `分账单已存在，跳过 paymentId=${payment.id} receiver=${row.receiverType}`,
        );
      }
    }

    // 落库后立刻向渠道下发分账指令，把渠道分账单号回填
    await this.dispatchToChannel(payment, saved);
    return saved;
  }

  private buildRow(
    merchantId: number,
    payment: Payment,
    receiverType: ProfitShareReceiver,
    amountCents: number,
    rate: number,
    unfreezeAt: Date,
  ): ProfitShare {
    return this.shareRepository.create({
      merchantId,
      shareNo: generateShareNo(),
      paymentId: payment.id,
      orderId: payment.orderId,
      channel: payment.channel,
      receiverType,
      receiverAccount: null,
      amountCents,
      rate,
      status: ProfitShareStatus.Pending,
      channelShareId: null,
      unfreezeAt,
      unfrozenAt: null,
      retryCount: 0,
      failureReason: null,
    });
  }

  /** 向渠道下发分账指令；渠道不支持或未就绪时保持 pending，等定时任务再试。 */
  private async dispatchToChannel(payment: Payment, shares: ProfitShare[]): Promise<void> {
    if (shares.length === 0) {
      return;
    }
    const provider = this.registry.resolve(payment.channel);
    if (!provider.isReady()) {
      this.logger.warn(`渠道 ${payment.channel} 未就绪，分账单保持 pending 待重试`);
      return;
    }

    try {
      const result = await provider.profitShare({ payment, shares });
      const status = result.status;
      await this.shareRepository.update(
        { id: In(shares.map((s) => s.id)) },
        { status, channelShareId: result.channelShareId },
      );
      for (const share of shares) {
        share.status = status;
        share.channelShareId = result.channelShareId;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`下发分账指令失败 paymentId=${payment.id}: ${message}`);
      await this.shareRepository.update(
        { id: In(shares.map((s) => s.id)) },
        { status: ProfitShareStatus.Failed, failureReason: message.slice(0, 255) },
      );
    }
  }

  /* ---------------------------- 解冻任务 ---------------------------- */

  /**
   * 扫描到期未解冻的分账单并逐笔解冻。
   * 单笔失败只累加 retryCount，不阻断整批；超过上限置为 failed 等人工介入。
   */
  async unfreezeDue(limit = 200): Promise<number> {
    const due = await this.shareRepository.find({
      where: {
        status: In([...OPEN_PROFIT_SHARE_STATUSES]),
        unfreezeAt: LessThanOrEqual(new Date()),
      },
      order: { id: 'ASC' },
      take: limit,
    });

    let done = 0;
    for (const share of due) {
      if (await this.unfreezeOne(share)) {
        done += 1;
      }
    }
    return done;
  }

  /** 单笔解冻；返回 true 表示本轮成功解冻。 */
  private async unfreezeOne(share: ProfitShare): Promise<boolean> {
    // 先 CAS 抢占为 unfreezing，避免多实例同时解冻同一笔
    const claimed = await this.shareRepository.update(
      { id: share.id, status: In([...OPEN_PROFIT_SHARE_STATUSES]) },
      { status: ProfitShareStatus.Unfreezing },
    );
    if ((claimed.affected ?? 0) === 0) {
      return false;
    }

    const provider = this.registry.resolve(share.channel);
    try {
      if (!provider.isReady()) {
        throw new Error(`渠道 ${share.channel} 未就绪`);
      }
      const result = await provider.unfreezeShare(share);
      if (result.status === ProfitShareStatus.Unfrozen) {
        await this.shareRepository.update(
          { id: share.id },
          {
            status: ProfitShareStatus.Unfrozen,
            unfrozenAt: result.unfrozenAt ?? new Date(),
            failureReason: null,
          },
        );
        return true;
      }
      await this.recordFailure(share, '渠道未确认解冻');
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.recordFailure(share, message);
      return false;
    }
  }

  private async recordFailure(share: ProfitShare, reason: string): Promise<void> {
    const nextRetry = share.retryCount + 1;
    const exhausted = nextRetry >= PROFIT_SHARE_MAX_RETRY;
    await this.shareRepository.update(
      { id: share.id },
      {
        status: exhausted ? ProfitShareStatus.Failed : ProfitShareStatus.Frozen,
        retryCount: nextRetry,
        failureReason: reason.slice(0, 255),
        // 未耗尽时推迟一会儿再试，避免每轮都撞同一笔
        unfreezeAt: exhausted ? share.unfreezeAt : this.unfreezeDate(new Date(), 0),
      },
    );
    this.logger.warn(
      `分账解冻失败 shareNo=${share.shareNo} retry=${nextRetry}/${PROFIT_SHARE_MAX_RETRY}: ${reason}`,
    );
  }

  /** 到期时间 = 当前时刻 + PROFIT_SHARE_UNFREEZE_DAYS 天（至少 +5 分钟）。 */
  private unfreezeDate(from: Date, days = PROFIT_SHARE_UNFREEZE_DAYS): Date {
    const ms = Math.max(days * 24 * 60 * 60 * 1000, 5 * 60 * 1000);
    return new Date(from.getTime() + ms);
  }

  /** 手动触发指定支付单的分账生成（补漏用）。 */
  async generateForOrder(
    merchantId: number,
    orderId: number,
    profitShareRate: number | null,
  ): Promise<ProfitShare[]> {
    const payment = await this.dataSource.getRepository(Payment).findOne({
      where: { merchantId, orderId },
      order: { id: 'DESC' },
    });
    if (!payment) {
      throw BusinessException.notFound('该订单没有支付记录');
    }
    return this.generateForPayment(merchantId, payment, profitShareRate);
  }
}
