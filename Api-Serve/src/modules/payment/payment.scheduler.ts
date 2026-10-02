import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '../redis/redis.service';
import { PaymentService } from './payment.service';
import { RECONCILE_CRON } from './constants/reconcile.constant';
import { formatDateKey } from '../../common/utils/date.util';
import { PaymentProfitShareService } from './services/payment-profit-share.service';
import { PaymentReconcileService } from './services/payment-reconcile.service';

/**
 * 支付相关的兜底任务。
 *
 * 渠道通知不可靠（超时、重启、网络抖动都会丢），所以"查单纠偏"和"超时关单"
 * 必须有独立触发路径，不能只依赖回调。
 * 用 Redis 抢锁保证多实例部署时只有一个节点执行。
 */
@Injectable()
export class PaymentScheduler {
  private readonly logger = new Logger(PaymentScheduler.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly profitShareService: PaymentProfitShareService,
    private readonly reconcileService: PaymentReconcileService,
    private readonly redis: RedisService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async closeExpiredPayments(): Promise<void> {
    await this.runExclusive('payment:lock:close-expired', 55, async () => {
      const closed = await this.paymentService.closeExpiredPayments();
      if (closed > 0) {
        this.logger.log(`关闭超时支付单 ${closed} 笔`);
      }
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async syncPendingPayments(): Promise<void> {
    await this.runExclusive('payment:lock:sync-pending', 55, async () => {
      const fixed = await this.paymentService.syncPendingPayments();
      if (fixed > 0) {
        this.logger.log(`查单纠偏补录支付成功 ${fixed} 笔`);
      }
    });
  }

  /** 每 10 分钟扫一遍到期分账单并解冻（T+1 到期的资金）。 */
  @Cron('0 */10 * * * *')
  async unfreezeProfitShares(): Promise<void> {
    await this.runExclusive('payment:lock:unfreeze-shares', 540, async () => {
      const done = await this.profitShareService.unfreezeDue();
      if (done > 0) {
        this.logger.log(`分账解冻成功 ${done} 笔`);
      }
    });
  }

  /**
   * 每日 02:00 对前一自然日做账目核对。
   *
   * 这里只做"发起重算"，真正的比对在 PaymentReconcileService 里；
   * 渠道账单没出齐时台账会被标成 pending_bill，由下面每 30 分钟的重试任务
   * 继续推进——不在这个任务里 sleep 等账单，那样会把定时器占住。
   */
  @Cron(RECONCILE_CRON)
  async reconcileYesterday(): Promise<void> {
    await this.runExclusive('payment:lock:reconcile-daily', 3600, async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const tradeDate = formatDateKey(yesterday);
      const handled = await this.reconcileService.runDaily(tradeDate);
      this.logger.log(`对账任务完成 ${tradeDate}，处理台账 ${handled} 份`);
    });
  }

  /** 每 30 分钟推进一次"渠道账单还没取到"的台账。 */
  @Cron('0 */30 * * * *')
  async retryReconciles(): Promise<void> {
    await this.runExclusive('payment:lock:reconcile-retry', 1500, async () => {
      const done = await this.reconcileService.retryOpen();
      if (done > 0) {
        this.logger.log(`对账重试补齐 ${done} 份台账`);
      }
    });
  }

  private async runExclusive(
    lockKey: string,
    ttlSeconds: number,
    task: () => Promise<void>,
  ): Promise<void> {
    if (!(await this.redis.acquireLock(lockKey, ttlSeconds))) {
      return;
    }
    try {
      await task();
    } catch (error) {
      this.logger.error(
        `${lockKey} 执行失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await this.redis.releaseLock(lockKey);
    }
  }
}
