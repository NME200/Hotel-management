import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MemberLevel, MemberStatus } from '../../common/constants/dict';
import { decimalTransformer } from '../transformers/decimal.transformer';
import { TenantBaseEntity } from './base.entity';
import { Customer } from './customer.entity';

@Entity('member', { comment: '商户会员档案：某个顾客在某一家店里的会员身份' })
@Index(['merchantId', 'customerId'], { unique: true })
@Index(['merchantId', 'level'])
@Index(['customerId'])
export class Member extends TenantBaseEntity {
  /**
   * 归属的登录身份。昵称、手机号、微信 openid 这些「你是谁」的信息都在 customer 上，
   * member 只存这家店自己的经营数据（等级、成长值、余额、券、累计消费）。
   */
  @Column({ name: 'customer_id', type: 'int', comment: '所属顾客 ID' })
  customerId!: number;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ type: 'varchar', length: 16, default: MemberLevel.Normal, comment: '等级' })
  level!: MemberLevel;

  @Column({ type: 'int', default: 0, comment: '成长值，只由消费与任务累加' })
  growthValue!: number;

  @Column({ type: 'int', default: 0, comment: '积分' })
  points!: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '储值余额',
  })
  balance!: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '累计消费金额',
  })
  totalAmount!: number;

  @Column({ type: 'int', default: 0, comment: '累计订单数' })
  orderCount!: number;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '商家备注' })
  remark!: string | null;

  @Column({ type: 'varchar', length: 16, default: MemberStatus.Active, comment: '状态' })
  status!: MemberStatus;

  @Column({ type: 'varchar', length: 16, default: 'mini_program', comment: '注册来源' })
  registerSource!: string;

  @Column({ type: 'datetime', nullable: true, comment: '最近下单时间' })
  lastOrderAt!: Date | null;
}
