import { Column, Entity, Index } from 'typeorm';
import { MerchantStatus } from '../../common/constants/dict';
import { BaseEntity } from './base.entity';

/** 商户即 SaaS 租户，商户 ID 贯穿所有业务表。 */
@Entity('merchant')
export class Merchant extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32, comment: '商户编号，登录时使用' })
  code!: string;

  @Column({ type: 'varchar', length: 128, comment: '商户名称' })
  name!: string;

  @Column({ type: 'varchar', length: 64, comment: '联系人' })
  contactName!: string;

  @Column({ type: 'varchar', length: 20, comment: '联系电话' })
  contactPhone!: string;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: 'Logo 地址' })
  logo!: string | null;

  @Index()
  @Column({
    type: 'varchar',
    length: 16,
    default: MerchantStatus.PendingAudit,
    comment: '商户状态',
  })
  status!: MerchantStatus;

  @Column({ type: 'datetime', nullable: true, comment: '服务到期时间' })
  expireAt!: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '备注' })
  remark!: string | null;

  @Column({ type: 'datetime', nullable: true, comment: '审核通过时间' })
  auditedAt!: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '审核意见' })
  auditRemark!: string | null;
}
