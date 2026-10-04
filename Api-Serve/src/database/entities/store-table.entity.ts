import { Column, Entity, Index } from 'typeorm';
import { AccountStatus, TableDiningStatus } from '../../common/constants/dict';
import { TenantBaseEntity } from './base.entity';

/**
 * 门店桌位：一张桌子一条记录，也是「一桌一码」的载体。
 *
 * 为什么要有这张表，而不是继续用订单上的 `table_no` 自由文本：
 * - 桌贴上的小程序码一旦印出去就换不了，所以桌号必须能被改而不影响已印的码；
 * - 某张桌停用（装修、包场）时只作废这一张的码，不动别的桌；
 * - 顾客不能自己拼一个 scene 把订单下到别桌 —— 码里放的是不可猜的 `qr_token`。
 *
 * `qr_token` 全局唯一（不是店内唯一）：scene 里只带 token 就能反查出
 * 「哪家店、哪张桌」，小程序端不必再传商户号，后端也能顺带校验归属防串店。
 */
@Entity('store_table', { comment: '门店桌位（一桌一码）' })
@Index('uk_store_table_merchant_no', ['merchantId', 'tableNo'], { unique: true })
@Index('uk_store_table_qr_token', ['qrToken'], { unique: true })
@Index(['merchantId', 'sort'])
@Index('idx_store_table_merchant_id_dining_status', ['merchantId', 'diningStatus'])
export class StoreTable extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 32, comment: '桌号，店内唯一，如 A01 / 8号桌' })
  tableNo!: string;

  @Column({
    type: 'varchar',
    length: 64,
    comment: '扫码令牌，全局唯一，小程序码 scene 里携带它而不是桌号明文',
  })
  qrToken!: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '小程序码图片地址；生成失败时为空，可在商家端重新生成',
  })
  qrCodeUrl!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '区域，如「一楼大厅」' })
  area!: string | null;

  @Column({ type: 'int', nullable: true, comment: '座位数，仅作提示' })
  seats!: number | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: AccountStatus.Active,
    comment: '状态 active=启用 | disabled=停用（停用后扫码提示该桌位不可用）',
  })
  status!: AccountStatus;

  @Column({ type: 'int', default: 0, comment: '排序，越小越靠前' })
  sort!: number;

  /**
   * 用餐状态：收银台的开台/清台就改这一个字段。
   *
   * 与 `status`（启用/停用）刻意分开：一张桌可以「正在用餐」同时「被停用」
   * （临时包场），也能「空闲」且「启用」。合成一个字段就没法表达这两种正交状态。
   */
  @Column({
    type: 'varchar',
    length: 16,
    default: TableDiningStatus.Idle,
    comment: '用餐状态 idle=空闲 | dining=用餐中（由收银台开台/清台维护）',
  })
  diningStatus!: TableDiningStatus;

  @Column({ type: 'int', nullable: true, comment: '开台时登记的就餐人数' })
  guestCount!: number | null;

  @Column({ type: 'datetime', nullable: true, comment: '开台时间，看板据此算用餐时长' })
  openedAt!: Date | null;
}
