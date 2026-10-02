import { Column, Entity, Index } from 'typeorm';
import {
  NotifyType,
  PaymentChannel,
} from '../../modules/payment/constants/payment.constant';
import { BaseEntity } from './base.entity';

/**
 * 渠道异步通知原始记录。
 * 排障与对账的唯一事实来源：先落库再处理，处理失败也能凭这条记录重放。
 * (channel, notifyId) 唯一索引用于天然去重——渠道会重试通知，重复通知不能重复入账。
 */
@Entity('payment_notify_log', { comment: '支付渠道通知原始记录' })
@Index(['channel', 'notifyId'], { unique: true })
@Index(['merchantId', 'createdAt'])
@Index(['paymentNo'])
@Index(['tradeNo'])
export class PaymentNotifyLog extends BaseEntity {
  @Column({ type: 'varchar', length: 16, comment: '通知来源渠道' })
  channel!: PaymentChannel;

  @Column({ type: 'int', nullable: true, comment: '归属商户，未识别到时为空' })
  merchantId!: number | null;

  @Column({ type: 'varchar', length: 16, comment: '通知类型 payment|refund' })
  notifyType!: NotifyType;

  @Column({ type: 'varchar', length: 64, comment: '渠道通知唯一 ID，去重用' })
  notifyId!: string;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '商户支付单号' })
  paymentNo!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '商户退款单号' })
  refundNo!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '渠道交易号' })
  tradeNo!: string | null;

  @Column({ type: 'int', nullable: true, comment: '通知里的金额（分），用于与本地核对' })
  amountCents!: number | null;

  @Column({ type: 'simple-json', nullable: true, comment: '验签解密后的业务数据' })
  payload!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true, comment: '原始请求体，排障用' })
  rawBody!: string | null;

  @Column({ type: 'boolean', default: true, comment: '验签是否通过' })
  verified!: boolean;

  @Column({ type: 'boolean', default: false, comment: '是否已被业务处理' })
  handled!: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '处理结果或失败原因' })
  processResult!: string | null;
}
