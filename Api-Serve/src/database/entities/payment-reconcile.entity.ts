import { Column, Entity, Index } from 'typeorm';
import { PaymentChannel } from '../../modules/payment/constants/payment.constant';
import { ReconcileStatus } from '../../modules/payment/constants/reconcile.constant';
import { TenantBaseEntity } from './base.entity';

/**
 * 对账台账：一个商户在一个渠道上某一天的账目核对结果。
 *
 * 粒度选「商户 × 渠道 × 自然日」而不是「全平台 × 日」，原因有两个：
 * 一是渠道账单本身就是按子商户号出的（服务商模式下必须分开下载），
 * 二是差异要落到具体商户头上才有人能处理，全平台的汇总账没人能去对。
 *
 * 金额一律整数分，与支付/分账表口径一致；本地侧金额用
 * `SUM(refunded_cents)` 的退款额单独记一列，不冲抵交易额——
 * 冲抵之后"金额差"会因为退款被掩盖掉。
 */
@Entity('payment_reconcile', { comment: '对账台账（本地账 vs 渠道账）' })
@Index(['reconcileNo'], { unique: true })
@Index(['merchantId', 'channel', 'tradeDate'], { unique: true })
@Index(['tradeDate', 'status'])
@Index(['status', 'nextRetryAt'])
export class PaymentReconcile extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 32, comment: '对账单号，每商户每渠道每日一份' })
  reconcileNo!: string;

  @Column({ type: 'varchar', length: 16, comment: '支付渠道' })
  channel!: PaymentChannel;

  @Column({ type: 'date', comment: '对账日（自然日，以渠道账单所属日为准）' })
  tradeDate!: string;

  /* --------------------------- 渠道侧汇总 --------------------------- */

  @Column({ type: 'int', default: 0, comment: '渠道账笔数' })
  channelCount!: number;

  @Column({ type: 'int', default: 0, comment: '渠道账金额合计（分）' })
  channelAmountCents!: number;

  @Column({ type: 'int', default: 0, comment: '渠道手续费合计（分）' })
  channelFeeCents!: number;

  /* --------------------------- 本地侧汇总 --------------------------- */

  @Column({ type: 'int', default: 0, comment: '本地账笔数（成功支付）' })
  localCount!: number;

  @Column({ type: 'int', default: 0, comment: '本地账金额合计（分）' })
  localAmountCents!: number;

  @Column({ type: 'int', default: 0, comment: '本地当日退款金额（分），单独列示不冲抵' })
  localRefundCents!: number;

  /* ----------------------------- 差异 ----------------------------- */

  @Column({ type: 'int', default: 0, comment: '差异笔数' })
  diffCount!: number;

  @Column({ type: 'int', default: 0, comment: '差异金额合计（分），按绝对值累加' })
  diffAmountCents!: number;

  @Column({
    type: 'varchar',
    length: 16,
    default: ReconcileStatus.PendingBill,
    comment: '状态 pending_bill|running|balanced|mismatch|failed',
  })
  status!: ReconcileStatus;

  /** 渠道账单是否已取到；false 时本地账目为空（不去猜渠道账） */
  @Column({ type: 'boolean', default: false, comment: '渠道账单是否已成功取到' })
  billDownloaded!: boolean;

  @Column({ type: 'datetime', nullable: true, comment: '渠道账单下载完成时间' })
  billFetchedAt!: Date | null;

  @Column({ type: 'int', default: 0, comment: '台账重试次数（渠道账单未取到时的重试）' })
  retryCount!: number;

  @Column({ type: 'datetime', nullable: true, comment: '下次重试时间' })
  nextRetryAt!: Date | null;

  @Column({ type: 'datetime', nullable: true, comment: '对账完成时间' })
  reconciledAt!: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '失败/未完成原因' })
  failureReason!: string | null;
}
