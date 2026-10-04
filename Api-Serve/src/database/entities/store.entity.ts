import { Column, Entity, Index } from 'typeorm';
import { StoreStatus } from '../../common/constants/dict';
import { decimalTransformer } from '../transformers/decimal.transformer';
import { TenantBaseEntity } from './base.entity';

@Entity('store', { comment: '门店基础信息，一个商户一个营业门店' })
@Index('uk_store_merchant_id', ['merchantId'], { unique: true })
export class Store extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 128, comment: '门店名称' })
  name!: string;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '门头照' })
  logo!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '省' })
  province!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '市' })
  city!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '区/县' })
  district!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '详细地址' })
  address!: string | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: decimalTransformer,
    comment: '经度',
  })
  longitude!: number | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: decimalTransformer,
    comment: '纬度',
  })
  latitude!: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '客服电话' })
  phone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '门店公告' })
  notice!: string | null;

  @Column({
    type: 'simple-json',
    comment: '营业时间段，如 ["10:00-14:00","17:00-21:00"]',
  })
  businessHours!: string[];

  @Column({
    type: 'varchar',
    length: 16,
    default: StoreStatus.Closed,
    comment: '营业状态',
  })
  status!: StoreStatus;

  @Column({
    type: 'boolean',
    default: false,
    comment: '接单后自动打印小票：关掉后只能手动点打印，避免默认打扰',
  })
  autoPrint!: boolean;

  @Column({
    type: 'varchar',
    length: 16,
    default: 'accepted',
    comment: '自动打印触发时机 accepted=接单后 | ready=出餐后',
  })
  autoPrintOn!: string;

  @Column({
    type: 'int',
    default: 1,
    comment: '顾客小票默认份数，后厨小票份数在 printer 上按台配置',
  })
  customerCopies!: number;
}
