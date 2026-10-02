import { Column, Entity, Index } from 'typeorm';
import {
  PaymentChannel,
  RefundStatus,
} from '../../modules/payment/constants/payment.constant';
import { TenantBaseEntity } from './base.entity';

/** 退款单：支持部分退款，累计金额不得超过原支付单金额。 */
@Entity('payment_refund', { comment: '退款单' })
@Index(['refundNo'], { unique: true })
@Index(['channelRefundId'], { unique: true })
@Index(['merchantId', 'orderId'])
@Index(['merchantId', 'status', 'createdAt'])
export class PaymentRefund extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 32, comment: '商户退款单号 out_refund_no' })
  refundNo!: string;

  @Column({ type: 'int', comment: '支付单 ID' })
  paymentId!: number;

  @Column({ type: 'int', comment: '订单 ID' })
  orderId!: number;

  @Column({ type: 'varchar', length: 16, comment: '退款渠道，跟随原支付单' })
  channel!: PaymentChannel;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '渠道退款单号 refund_id',
  })
  channelRefundId!: string | null;

  @Column({ type: 'int', comment: '退款金额（分）' })
  amountCents!: number;

  @Column({ type: 'int', comment: '原支付单金额（分），对账时免二次查询' })
  totalAmountCents!: number;

  @Column({ type: 'varchar', length: 16, default: RefundStatus.Processing, comment: '退款状态' })
  status!: RefundStatus;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '退款原因' })
  reason!: string | null;

  @Column({ type: 'int', nullable: true, comment: '操作人 ID（商家端员工）' })
  operatorId!: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '操作人名称快照' })
  operatorName!: string | null;

  @Column({ type: 'datetime', nullable: true, comment: '退款成功时间' })
  succeededAt!: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '失败原因' })
  failureReason!: string | null;
}
