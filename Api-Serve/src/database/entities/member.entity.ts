import { Column, Entity, Index } from 'typeorm';
import {
  Gender,
  MemberLevel,
  MemberStatus,
} from '../../common/constants/dict';
import { decimalTransformer } from '../transformers/decimal.transformer';
import { TenantBaseEntity } from './base.entity';

@Entity('member', { comment: '商户会员，小程序下单后自动建档' })
@Index(['merchantId', 'phone'], { unique: true })
@Index(['merchantId', 'level'])
@Index(['merchantId', 'openid'], { unique: true })
export class Member extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 64, comment: '昵称' })
  nickname!: string;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '头像' })
  avatar!: string | null;

  /**
   * 手机号可空：小程序授权登录只给出 openid，顾客可以在结算时再补手机号，
   * 唯一约束在 MySQL 下不拦 NULL，因此多条无手机号的会员记录可以共存。
   */
  @Column({ type: 'varchar', length: 20, nullable: true, comment: '手机号，商户内唯一' })
  phone!: string | null;

  /**
   * 微信 openid：同一小程序下同一微信用户在每个商户各存一条会员记录，
   * 因此唯一约束是 (merchant_id, openid) 而不是 openid 单列。
   */
  @Column({ type: 'varchar', length: 64, nullable: true, comment: '微信 openid' })
  openid!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '微信 unionid' })
  unionid!: string | null;

  @Column({ type: 'varchar', length: 8, default: Gender.Unknown, comment: '性别' })
  gender!: Gender;

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
