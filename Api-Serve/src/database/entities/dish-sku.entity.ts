import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { decimalTransformer } from '../transformers/decimal.transformer';
import { Dish } from './dish.entity';
import { TenantBaseEntity } from './base.entity';

@Entity('dish_sku', { comment: '菜品规格' })
@Index(['merchantId', 'dishId'])
export class DishSku extends TenantBaseEntity {
  @Column({ name: 'dish_id', type: 'int', comment: '所属菜品 ID' })
  dishId!: number;

  @ManyToOne(() => Dish, (dish) => dish.skus, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dish_id' })
  dish!: Dish;

  @Column({ type: 'varchar', length: 64, comment: '规格名称，如 小份/大份' })
  name!: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
    comment: '规格售价',
  })
  price!: number;

  @Column({ type: 'varchar', length: 128, nullable: true, comment: '规格描述' })
  specDesc!: string | null;

  @Column({ type: 'int', nullable: true, comment: '规格库存' })
  stock!: number | null;

  @Column({ type: 'int', default: 0, comment: '排序值' })
  sort!: number;
}
