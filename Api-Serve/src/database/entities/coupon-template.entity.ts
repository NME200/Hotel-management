import { Column, Entity, Index } from 'typeorm';
import {
  CouponScopeType,
  CouponStatus,
  CouponType,
  CouponValidityType,
} from '../../common/constants/dict';
import { TenantBaseEntity } from './base.entity';

/**
 * 优惠券模板：商户配置一次，顾客领取/兑换后复制成 member_coupon。
 *
 * 金额一律用「分」的整数（amountCents / thresholdCents / maxDiscountCents），
 * 与支付域同一口径，结算时不会出现浮点凑不平的优惠。
 * 折扣券的 discountRatio 是「实付比例」快照口径（0.8800 = 8.8 折），
 * 优惠额 = 参与金额 × (1 - ratio) 向下取整，再受 maxDiscountCents 封顶。
 */
@Entity('coupon_template', { comment: '优惠券模板' })
@Index(['merchantId', 'status'])
@Index(['merchantId', 'claimable', 'status'])
export class CouponTemplate extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 64, comment: '券名称' })
  name!: string;

  @Column({
    type: 'varchar',
    length: 16,
    default: CouponType.Reduction,
    comment: '券类型 reduction|discount',
  })
  type!: CouponType;

  @Column({ type: 'int', default: 0, comment: '满减面额（分），折扣券为 0' })
  amountCents!: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 4,
    nullable: true,
    comment: '折扣券实付比例，如 0.8800 表示 8.8 折',
  })
  discountRatio!: number | null;

  @Column({ type: 'int', nullable: true, comment: '折扣券最高优惠（分），null 表示不封顶' })
  maxDiscountCents!: number | null;

  @Column({ type: 'int', default: 0, comment: '使用门槛（分），0 表示无门槛' })
  thresholdCents!: number;

  @Column({
    type: 'varchar',
    length: 16,
    default: CouponValidityType.Fixed,
    comment: '有效期模式 fixed|relative',
  })
  validityType!: CouponValidityType;

  @Column({ type: 'datetime', nullable: true, comment: 'fixed 模式：生效时间' })
  validFrom!: Date | null;

  @Column({ type: 'datetime', nullable: true, comment: 'fixed 模式：失效时间' })
  validTo!: Date | null;

  @Column({ type: 'int', nullable: true, comment: 'relative 模式：领取后 N 天内有效' })
  validDays!: number | null;

  @Column({ type: 'int', default: -1, comment: '发放总量，-1 不限' })
  totalCount!: number;

  @Column({ type: 'int', default: 0, comment: '已发放数量' })
  issuedCount!: number;

  @Column({ type: 'int', default: 1, comment: '每人限领张数' })
  perMemberLimit!: number;

  @Column({ type: 'boolean', default: true, comment: '是否出现在领券中心' })
  claimable!: boolean;

  @Column({ type: 'varchar', length: 16, nullable: true, comment: '兑换码，商户内唯一' })
  redeemCode!: string | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: CouponScopeType.All,
    comment: '适用范围 all|category|dish',
  })
  scopeType!: CouponScopeType;

  @Column({ type: 'simple-json', nullable: true, comment: 'scopeType 非 all 时的 ID 列表' })
  scopeIds!: number[] | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '使用说明' })
  description!: string | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: CouponStatus.Enabled,
    comment: '模板状态 enabled|disabled',
  })
  status!: CouponStatus;

  @Column({ type: 'int', default: 0, comment: '排序值，越小越靠前' })
  sort!: number;
}
