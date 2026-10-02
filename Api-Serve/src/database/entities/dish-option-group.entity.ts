import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { OptionGroupType } from '../../common/constants/dict';
import { Dish } from './dish.entity';
import { TenantBaseEntity } from './base.entity';

export interface DishOptionItem {
  name: string;
  priceDelta: number;
  sort: number;
}

@Entity('dish_option_group', { comment: '菜品加料/口味分组' })
@Index(['merchantId', 'dishId', 'sort'])
export class DishOptionGroup extends TenantBaseEntity {
  @Column({ name: 'dish_id', type: 'int', comment: '所属菜品 ID' })
  dishId!: number;

  @ManyToOne(() => Dish, (dish) => dish.optionGroups, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dish_id' })
  dish!: Dish;

  @Column({ type: 'varchar', length: 64, comment: '分组名称，如 辣度' })
  name!: string;

  @Column({ type: 'varchar', length: 16, comment: '单选 single / 多选 multi' })
  type!: OptionGroupType;

  @Column({ type: 'boolean', default: false, comment: '是否必选' })
  required!: boolean;

  @Column({ type: 'int', default: 0, comment: '排序值' })
  sort!: number;

  @Column({ type: 'simple-json', comment: '可选项列表 [{name,priceDelta,sort}]' })
  options!: DishOptionItem[];
}
