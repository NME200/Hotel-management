import { Column, Entity, Index } from 'typeorm';
import { decimalTransformer } from '../transformers/decimal.transformer';
import { TenantBaseEntity } from './base.entity';

/**
 * 商户支付进件与开通状态（每商户每渠道一行）。
 *
 * 流程：商户在商家端提交资料 -> pending_audit -> 平台审核通过 -> enabled
 * （驳回 -> rejected，可修改后重新提交）；平台可随时把 enabled 置为 disabled。
 * 只有 enabled 且渠道总开关打开时，该商户才允许发起支付。
 */
@Entity('merchant_payment_config', { comment: '商户支付进件与开通配置' })
@Index(['merchantId', 'channel'], { unique: true })
@Index(['status', 'createdAt'])
export class MerchantPaymentConfig extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 16, comment: '渠道 wechat|alipay|mock' })
  channel!: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'pending_audit',
    comment: '状态 pending_audit|enabled|rejected|disabled',
  })
  status!: string;

  @Column({
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '特约商户号 sub_mchid / 支付宝 partner id',
  })
  channelAccount!: string | null;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
    comment: '渠道费率',
  })
  feeRate!: number | null;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
    comment: '平台抽佣比例',
  })
  profitShareRate!: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '结算户名' })
  settleAccountName!: string | null;

  @Column({ type: 'text', nullable: true, comment: '结算账号（密文）' })
  settleAccountNoEncrypted!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '营业执照号' })
  licenseNo!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '联系人' })
  contactName!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '联系电话' })
  contactPhone!: string | null;

  @Column({ type: 'datetime', nullable: true, comment: '提交时间' })
  appliedAt!: Date | null;

  @Column({ type: 'int', nullable: true, comment: '提交人（商户员工）ID' })
  appliedById!: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '提交人姓名快照' })
  appliedByName!: string | null;

  @Column({ type: 'datetime', nullable: true, comment: '审核时间' })
  auditedAt!: Date | null;

  @Column({ type: 'int', nullable: true, comment: '审核人（平台账号）ID' })
  auditedById!: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '审核人姓名快照' })
  auditedByName!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '审核意见 / 驳回原因' })
  auditRemark!: string | null;
}
