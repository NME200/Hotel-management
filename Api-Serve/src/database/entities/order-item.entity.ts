import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { decimalTransformer } from '../transformers/decimal.transformer';
import { Order } from './order.entity';
import { TenantBaseEntity } from './base.entity';

@Entity('order_item', { comment: '订单明细，菜品信息以快照存储' })
@Index(['merchantId', 'orderId'])
export class OrderItem extends TenantBaseEntity {
  @Column({ name: 'order_id', type: 'int', comment: '所属订单 ID' })
  orderId!: number;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ type: 'int', nullable: true, comment: '菜品 ID' })
  dishId!: number | null;

  @Column({ type: 'varchar', length: 64, comment: '菜品名称快照' })
  dishName!: string;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '菜品图片快照' })
  dishImage!: string | null;

  @Column({ type: 'int', nullable: true, comment: '规格 ID' })
  skuId!: number | null;

  @Column({ type: 'varchar', length: 128, nullable: true, comment: '规格与加料描述' })
  specDesc!: string | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
    comment: '单价',
  })
  unitPrice!: number;

  @Column({ type: 'int', comment: '数量' })
  quantity!: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
    comment: '小计金额',
  })
  totalAmount!: number;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '明细备注' })
  remark!: string | null;
}
