import { Column, Entity, Index } from 'typeorm';
import {
  CouponScopeType,
  PromotionStatus,
  PromotionType,
} from '../../common/constants/dict';
import { TenantBaseEntity } from './base.entity';

/**
 * 限时活动：会真正改成交价的那种活动，与只改文案的 activity（运营位）是两回事。
 *
 * 金额一律用「分」的整数，与券、支付同一口径。
 * 范围三档直接复用 CouponScopeType：券已经按 all/category/dish 匹配过订单行，
 * 活动用同一套，商家在两处看到的选法就是一样的。
 */
@Entity('promotion', { comment: '限时活动' })
@Index(['merchantId', 'status'])
@Index(['merchantId', 'startsAt', 'endsAt'])
export class Promotion extends TenantBaseEntity {
  @Column({
    type: 'varchar',
    length: 64,
    comment: '活动名称，只在商家端识别用',
  })
  name!: string;

  @Column({
    type: 'varchar',
    length: 16,
    nullable: true,
    comment: '顾客端角标文字，空则用默认「活动」',
  })
  badge!: string | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: PromotionType.Price,
    comment: '优惠算法 price=活动价 | discount=折扣',
  })
  type!: PromotionType;

  @Column({ type: 'int', nullable: true, comment: 'type=price：活动价（分），基于菜品基础价' })
  priceCents!: number | null;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 4,
    nullable: true,
    comment: 'type=discount：实付比例，0.6000 表示 6 折',
  })
  discountRatio!: number | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: CouponScopeType.All,
    comment: '适用范围 all|category|dish',
  })
  scopeType!: CouponScopeType;

  @Column({ type: 'simple-json', nullable: true, comment: 'scopeType 非 all 时的 ID 列表' })
  scopeIds!: number[] | null;

  @Column({ type: 'datetime', nullable: true, comment: '开始时间，空表示立即开始' })
  startsAt!: Date | null;

  @Column({ type: 'datetime', nullable: true, comment: '结束时间，空表示长期有效' })
  endsAt!: Date | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: PromotionStatus.Enabled,
    comment: '状态 enabled|disabled',
  })
  status!: PromotionStatus;
}
