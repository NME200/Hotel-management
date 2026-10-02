import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import {
  DineType,
  OrderStatus,
  PayStatus,
} from '../../common/constants/dict';
import { decimalTransformer } from '../transformers/decimal.transformer';
import { Member } from './member.entity';
import { OrderItem } from './order-item.entity';
import { TenantBaseEntity } from './base.entity';

@Entity('order_info', { comment: '点餐订单' })
@Index(['merchantId', 'status', 'createdAt'])
@Index(['merchantId', 'createdAt'])
@Index(['orderNo'], { unique: true })
export class Order extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 32, comment: '订单号，全局唯一' })
  orderNo!: string;

  @Column({ type: 'varchar', length: 8, nullable: true, comment: '取餐码' })
  pickupCode!: string | null;

  @Column({ name: 'member_id', type: 'int', nullable: true, comment: '下单会员 ID' })
  memberId!: number | null;

  @ManyToOne(() => Member, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'member_id' })
  member!: Member | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '下单时会员昵称快照' })
  memberNickname!: string | null;

  @Column({ type: 'varchar', length: 16, comment: '就餐方式' })
  dineType!: DineType;

  @Index()
  @Column({
    type: 'varchar',
    length: 16,
    default: OrderStatus.Pending,
    comment: '订单状态',
  })
  status!: OrderStatus;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '桌号' })
  tableNo!: string | null;

  @Column({ type: 'int', default: 1, comment: '就餐人数' })
  peopleCount!: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '菜品金额',
  })
  dishAmount!: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '打包费',
  })
  packingAmount!: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '配送费',
  })
  deliveryAmount!: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '优惠金额',
  })
  discountAmount!: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
    comment: '实付金额',
  })
  payAmount!: number;

  @Index()
  @Column({
    type: 'varchar',
    length: 20,
    default: PayStatus.Unpaid,
    comment: '支付状态，与出餐状态机独立',
  })
  payStatus!: PayStatus;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '顾客备注' })
  remark!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '商家处理备注' })
  handleRemark!: string | null;

  @Column({ type: 'datetime', nullable: true, comment: '接单时间' })
  acceptedAt!: Date | null;

  @Column({ type: 'datetime', nullable: true, comment: '出餐时间' })
  readyAt!: Date | null;

  @Column({ type: 'datetime', nullable: true, comment: '完成时间' })
  completedAt!: Date | null;

  @Column({ type: 'datetime', nullable: true, comment: '取消时间' })
  cancelledAt!: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '取消原因' })
  cancelReason!: string | null;

  @OneToMany(() => OrderItem, (item) => item.order)
  items!: OrderItem[];
}
