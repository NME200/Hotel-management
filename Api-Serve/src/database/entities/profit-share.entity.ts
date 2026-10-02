import { Column, Entity, Index } from 'typeorm';
import {
  ProfitShareReceiver,
  ProfitShareStatus,
} from '../../modules/payment/constants/profit-share.constant';
import { PaymentChannel } from '../../modules/payment/constants/payment.constant';
import { decimalTransformer } from '../transformers/decimal.transformer';
import { TenantBaseEntity } from './base.entity';

/**
 * 分账单：一笔成功支付拆成的「平台抽佣」与「商户结算」两条接收方记录。
 *
 * 一行 = 一个接收方在一笔支付里的应得金额。用 receiver_type 区分平台/商户，
 * 同一 payment_id 下通常两行（平台抽佣 + 商户货款）；只在服务商模式下生成，
 * 因为只有这种模式下平台才有资格替商户分账。
 *
 * 金额一律整数分，rate 是生成时的抽佣比率快照——商户后续改费率
 * 不能影响已经产生的分账单，否则历史账目会变。
 */
@Entity('profit_share', { comment: '分账单（服务商模式平台抽佣）' })
@Index(['shareNo'], { unique: true })
@Index(['paymentId', 'receiverType'])
@Index(['merchantId', 'status', 'createdAt'])
@Index(['status', 'unfreezeAt'])
export class ProfitShare extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 32, comment: '分账单号，渠道侧幂等键' })
  shareNo!: string;

  @Column({ type: 'int', comment: '支付单 ID' })
  paymentId!: number;

  @Column({ type: 'int', comment: '订单 ID' })
  orderId!: number;

  @Column({ type: 'varchar', length: 16, comment: '支付渠道' })
  channel!: PaymentChannel;

  @Column({
    type: 'varchar',
    length: 16,
    comment: '接收方类型 platform（平台抽佣）| merchant（商户结算）',
  })
  receiverType!: ProfitShareReceiver;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '接收方账户：平台服务商商户号 / 商户特约商户号',
  })
  receiverAccount!: string | null;

  @Column({ type: 'int', comment: '分账金额（分）' })
  amountCents!: number;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
    comment: '生成时的抽佣比率快照；商户结算行同样记录，便于核对两端相加是否等于原额',
  })
  rate!: number | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: ProfitShareStatus.Pending,
    comment: '状态 pending|frozen|unfreezing|unfrozen|failed',
  })
  status!: ProfitShareStatus;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '渠道分账单号 profit_sharing_id',
  })
  channelShareId!: string | null;

  @Column({ type: 'datetime', comment: '计划解冻时间（T+N）' })
  unfreezeAt!: Date;

  @Column({ type: 'datetime', nullable: true, comment: '实际解冻完成时间' })
  unfrozenAt!: Date | null;

  @Column({ type: 'int', default: 0, comment: '解冻重试次数' })
  retryCount!: number;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '失败原因' })
  failureReason!: string | null;
}
