import { Column, Entity, Index } from 'typeorm';
import { PaymentChannel } from '../../modules/payment/constants/payment.constant';
import { ReconcileDiffType } from '../../modules/payment/constants/reconcile.constant';
import { BaseEntity } from './base.entity';

/**
 * 对账差异明细：一笔业务单在渠道账与本地账之间的不一致。
 *
 * 一笔支付单在同一渠道下最多一条明细，唯一索引 (reconcile_id, channel, out_trade_no)
 * 兜住重复入账——重跑对账是对账的常规操作，不能因为重跑就多出重复差异。
 *
 * 这里**不继承 TenantBaseEntity**：明细挂在台账上，归属关系由台账承担；
 * 但 merchant_id 仍然冗余一份，方便按商户直接筛明细而不用回插台账表。
 */
@Entity('payment_reconcile_detail', { comment: '对账差异明细' })
@Index(['reconcileId', 'channel', 'outTradeNo'], { unique: true })
@Index(['reconcileId', 'diffType'])
@Index(['merchantId'])
export class PaymentReconcileDetail extends BaseEntity {
  @Column({ type: 'int', comment: '所属对账台账 ID' })
  reconcileId!: number;

  @Column({ type: 'int', comment: '所属商户 ID（冗余，便于按商户直查明细）' })
  merchantId!: number;

  @Column({ type: 'varchar', length: 16, comment: '支付渠道' })
  channel!: PaymentChannel;

  @Column({ type: 'varchar', length: 32, comment: '差异类型' })
  diffType!: ReconcileDiffType;

  /** 对账关联键：渠道账单里的 out_trade_no（即本地 payment_no） */
  @Column({ type: 'varchar', length: 32, comment: '商户支付单号，对账关联键' })
  outTradeNo!: string;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '本地支付单 ID' })
  paymentId!: number | null;

  @Column({ type: 'int', nullable: true, comment: '渠道侧金额（分）' })
  channelAmountCents!: number | null;

  @Column({ type: 'int', nullable: true, comment: '本地侧金额（分）' })
  localAmountCents!: number | null;

  @Column({ type: 'int', default: 0, comment: '差异金额（分），渠道 - 本地' })
  diffAmountCents!: number;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '渠道交易号 transaction_id' })
  channelTradeNo!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '本地交易号' })
  localTradeNo!: string | null;

  @Column({ type: 'varchar', length: 255, comment: '差异说明（人话，给运营看）' })
  remark!: string;

  @Column({ type: 'datetime', nullable: true, comment: '渠道账单里该笔的记账时间' })
  channelPaidAt!: Date | null;

  @Column({ type: 'simple-json', nullable: true, comment: '渠道账单原始明细快照' })
  rawChannel!: Record<string, unknown> | null;
}
