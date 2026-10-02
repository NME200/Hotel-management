import { Column, Entity, Index } from 'typeorm';
import {
  ActivityAction,
  ActivitySlot,
  ActivityStatus,
} from '../../common/constants/dict';
import { TenantBaseEntity } from './base.entity';

/**
 * 运营位活动：商户写一句话，小程序对应位置就显示这句话。
 *
 * 只有文案、位置、生效期属于商户可配的内容；会员日规则、可领券张数这类系统事实
 * 仍然来自代码常量和其它表，由顾客端接口合成成同一种卡片一起下发。
 */
@Entity('activity', { comment: '运营位活动' })
@Index(['merchantId', 'slot', 'status'])
@Index(['merchantId', 'startsAt', 'endsAt'])
export class Activity extends TenantBaseEntity {
  @Column({
    type: 'varchar',
    length: 64,
    comment: '活动名称，只在商家端识别用，不上小程序',
  })
  name!: string;

  @Column({
    type: 'varchar',
    length: 16,
    default: ActivitySlot.Home,
    comment: '展示位 home|mine|member',
  })
  slot!: ActivitySlot;

  @Column({ type: 'varchar', length: 64, comment: '顾客端主标题' })
  title!: string;

  @Column({ type: 'varchar', length: 128, nullable: true, comment: '顾客端副标题' })
  subTitle!: string | null;

  @Column({
    type: 'varchar',
    length: 16,
    nullable: true,
    comment: '图标机器码，前端映射成品牌色字符',
  })
  icon!: string | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: ActivityAction.None,
    comment: '点击跳转 none|coupons|menu|member|stores|search|promotion',
  })
  action!: ActivityAction;

  /**
   * 关联的限时活动。
   *
   * 运营位只管「说什么」，价格由 promotion 表决定；配上这个字段，
   * 顾客点卡片进菜单时就能只看这个活动的菜，而不是自己在几十道菜里找。
   */
  @Column({ type: 'int', nullable: true, comment: '关联的限时活动 ID，空表示纯展示卡' })
  promotionId!: number | null;

  @Column({ type: 'datetime', nullable: true, comment: '生效开始时间，空表示立即生效' })
  startsAt!: Date | null;

  @Column({ type: 'datetime', nullable: true, comment: '生效结束时间，空表示长期有效' })
  endsAt!: Date | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: ActivityStatus.Enabled,
    comment: '状态 enabled|disabled',
  })
  status!: ActivityStatus;

  @Column({ type: 'int', default: 0, comment: '排序值，越小越靠前' })
  sort!: number;
}
