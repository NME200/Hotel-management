import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { DishStatus, StockType } from '../../common/constants/dict';
import { decimalTransformer } from '../transformers/decimal.transformer';
import { Category } from './category.entity';
import { DishOptionGroup } from './dish-option-group.entity';
import { DishSku } from './dish-sku.entity';
import { TenantBaseEntity } from './base.entity';

@Entity('dish', { comment: '菜品' })
@Index(['merchantId', 'status'])
@Index(['merchantId', 'categoryId', 'sort'])
export class Dish extends TenantBaseEntity {
  @Column({ name: 'category_id', type: 'int', comment: '所属分类 ID' })
  categoryId!: number;

  @ManyToOne(() => Category, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category!: Category;

  @Column({ type: 'varchar', length: 64, comment: '菜品名称' })
  name!: string;

  @Column({ type: 'varchar', length: 128, nullable: true, comment: '副标题' })
  subtitle!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '主图' })
  image!: string | null;

  @Column({ type: 'text', nullable: true, comment: '菜品描述' })
  description!: string | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
    comment: '售价',
  })
  price!: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
    comment: '会员价',
  })
  memberPrice!: number | null;

  @Column({ type: 'varchar', length: 16, default: '份', comment: '计量单位' })
  unit!: string;

  @Column({
    type: 'varchar',
    length: 16,
    default: StockType.Unlimited,
    comment: '库存模式',
  })
  stockType!: StockType;

  @Column({ type: 'int', nullable: true, comment: '剩余库存，unlimited 时为 null' })
  stock!: number | null;

  @Column({ type: 'int', default: 0, comment: '累计销量' })
  salesCount!: number;

  @Column({ type: 'int', default: 0, comment: '排序值' })
  sort!: number;

  @Column({ type: 'boolean', default: false, comment: '是否招牌推荐' })
  isRecommend!: boolean;

  @Column({ type: 'simple-json', comment: '标签列表' })
  tags!: string[];

  @Column({
    type: 'varchar',
    length: 16,
    default: DishStatus.OnSale,
    comment: '上下架状态',
  })
  status!: DishStatus;

  @OneToMany(() => DishSku, (sku) => sku.dish)
  skus!: DishSku[];

  @OneToMany(() => DishOptionGroup, (group) => group.dish)
  optionGroups!: DishOptionGroup[];
}
