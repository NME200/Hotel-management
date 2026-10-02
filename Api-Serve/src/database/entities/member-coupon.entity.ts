import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { CouponScopeType, CouponType, MemberCouponStatus } from '../../common/constants/dict';
import { Member } from './member.entity';
import { TenantBaseEntity } from './base.entity';

/**
 * 会员持有的券：从模板复制出一份不可变快照。
 *
 * 之所以把面额、门槛、适用范围全部快照下来，是因为商户改模板不能追溯地
 * 影响已经发出去的券——和 order_item 快照菜品名与单价是同一个理由。
 */
@Entity('member_coupon', { comment: '会员优惠券' })
@Index(['couponNo'], { unique: true })
@Index(['merchantId', 'memberId', 'status'])
@Index(['merchantId', 'templateId'])
export class MemberCoupon extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 32, comment: '券号，全局唯一' })
  couponNo!: string;

  @Column({ name: 'template_id', type: 'int', comment: '来源模板 ID' })
  templateId!: number;

  @Column({ name: 'member_id', type: 'int', comment: '所属会员 ID' })
  memberId!: number;

  @ManyToOne(() => Member, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_id' })
  member!: Member;

  @Column({ type: 'varchar', length: 64, comment: '券名称快照' })
  name!: string;

  @Column({ type: 'varchar', length: 16, comment: '券类型快照 reduction|discount' })
  type!: CouponType;

  @Column({ type: 'int', default: 0, comment: '满减面额快照（分）' })
  amountCents!: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true, comment: '折扣比例快照' })
  discountRatio!: number | null;

  @Column({ type: 'int', nullable: true, comment: '最高优惠快照（分）' })
  maxDiscountCents!: number | null;

  @Column({ type: 'int', default: 0, comment: '使用门槛快照（分）' })
  thresholdCents!: number;

  @Column({ type: 'varchar', length: 16, comment: '适用范围快照' })
  scopeType!: CouponScopeType;

  @Column({ type: 'simple-json', nullable: true, comment: '适用范围 ID 列表快照' })
  scopeIds!: number[] | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '使用说明快照' })
  description!: string | null;

  @Column({ type: 'datetime', comment: '生效时间' })
  validFrom!: Date;

  @Column({ type: 'datetime', comment: '失效时间' })
  validTo!: Date;

  @Column({
    type: 'varchar',
    length: 16,
    default: MemberCouponStatus.Unused,
    comment: '状态 unused|used|expired',
  })
  status!: MemberCouponStatus;

  @Column({ type: 'varchar', length: 16, comment: '来源 claim|merchant_send|redeem_code' })
  source!: string;

  @Column({ name: 'order_id', type: 'int', nullable: true, comment: '核销订单 ID' })
  orderId!: number | null;

  @Column({ type: 'datetime', nullable: true, comment: '核销时间' })
  usedAt!: Date | null;
}
