import { Column, Entity, Index } from 'typeorm';
import { Gender, MemberStatus } from '../../common/constants/dict';
import { BaseEntity } from './base.entity';

/**
 * 小程序顾客：跨商户的登录身份，一个微信号一条记录。
 *
 * 与 member 的分工必须清楚：customer 回答「你是谁」（微信身份、昵称、手机号），
 * member 回答「你在这家店是什么等级的会员、还剩多少储值、领了哪些券」。
 * 拆开的直接收益是登录态不再绑门店——切店不用再登一次；
 * 而储值余额和券留在 member 上，是因为那是具体商户欠顾客的真实负债，
 * A 店充的 ¥50 不该拿到 B 店花。
 *
 * 这张表没有 merchant_id：它不属于任何一家店。
 */
@Entity('customer', { comment: '小程序顾客（跨商户登录身份）' })
@Index(['openid'], { unique: true })
@Index(['phone'])
export class Customer extends BaseEntity {
  /**
   * 微信 openid：同一小程序下全局唯一。
   * 可空是为了容纳商家端导入的历史会员（没有微信身份），
   * MySQL 唯一索引不拦 NULL，所以多条无 openid 的记录可以共存。
   */
  @Column({ type: 'varchar', length: 64, nullable: true, comment: '微信 openid，全局唯一' })
  openid!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '微信 unionid' })
  unionid!: string | null;

  @Column({ type: 'varchar', length: 64, comment: '昵称' })
  nickname!: string;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '头像' })
  avatar!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '手机号，顾客授权或结算时补' })
  phone!: string | null;

  @Column({ type: 'varchar', length: 8, default: Gender.Unknown, comment: '性别' })
  gender!: Gender;

  /** 平台级账号状态：停用即全平台不能下单，与商户在 member 上停用的是两回事 */
  @Column({ type: 'varchar', length: 16, default: MemberStatus.Active, comment: '状态 active|disabled' })
  status!: MemberStatus;

  @Column({ type: 'varchar', length: 16, default: 'mini_program', comment: '注册来源' })
  registerSource!: string;
}
