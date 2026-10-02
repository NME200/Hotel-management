import { Column, Entity, Index } from 'typeorm';
import {
  PaymentChannel,
  PaymentStatus,
} from '../../modules/payment/constants/payment.constant';
import { TenantBaseEntity } from './base.entity';

/**
 * 支付单：一笔订单的一次收款尝试。
 * paymentNo 即发给渠道的 out_trade_no，是全局唯一的幂等键；
 * 金额一律用整数分（amountCents），不与订单的 decimal 金额混算。
 */
@Entity('payment', { comment: '支付单' })
@Index(['paymentNo'], { unique: true })
@Index(['tradeNo'], { unique: true })
@Index(['merchantId', 'orderId'])
@Index(['merchantId', 'status', 'createdAt'])
export class Payment extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 32, comment: '商户支付单号 out_trade_no' })
  paymentNo!: string;

  @Column({ type: 'int', comment: '订单 ID' })
  orderId!: number;

  @Column({ type: 'varchar', length: 16, comment: '支付渠道 wechat|alipay|mock' })
  channel!: PaymentChannel;

  @Column({
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '渠道侧收款账户：微信特约商户号 sub_mchid / 支付宝 PID',
  })
  channelAccount!: string | null;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '渠道交易号 transaction_id，回调落库后回填',
  })
  tradeNo!: string | null;

  @Column({ type: 'int', comment: '支付金额（分）' })
  amountCents!: number;

  @Column({
    type: 'varchar',
    length: 16,
    default: PaymentStatus.Created,
    comment: '支付状态',
  })
  status!: PaymentStatus;

  @Column({ type: 'boolean', default: false, comment: '是否需要分账（服务商模式平台抽佣）' })
  needProfitSharing!: boolean;

  @Column({ type: 'int', default: 0, comment: '已退金额（分）' })
  refundedCents!: number;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '渠道预支付会话标识' })
  prepayId!: string | null;

  @Column({
    type: 'simple-json',
    nullable: true,
    comment: '客户端调起支付所需参数快照',
  })
  payParams!: Record<string, string> | null;

  @Column({ type: 'datetime', nullable: true, comment: '支付成功时间' })
  paidAt!: Date | null;

  @Column({ type: 'datetime', nullable: true, comment: '关单时间' })
  closedAt!: Date | null;

  @Column({ type: 'datetime', comment: '支付超时时间，超时后主动关单' })
  expireAt!: Date;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '失败原因' })
  failureReason!: string | null;
}
