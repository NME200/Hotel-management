import { Column, Entity, Index } from 'typeorm';
import { CategoryStatus } from '../../common/constants/dict';
import { TenantBaseEntity } from './base.entity';

@Entity('dish_category', { comment: '菜品分类' })
@Index(['merchantId', 'name'], { unique: true })
@Index(['merchantId', 'sort'])
export class Category extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 64, comment: '分类名称' })
  name!: string;

  @Column({ type: 'int', default: 0, comment: '排序值，越小越靠前' })
  sort!: number;

  @Column({
    type: 'varchar',
    length: 16,
    default: CategoryStatus.Enabled,
    comment: '状态',
  })
  status!: CategoryStatus;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '分类图标' })
  image!: string | null;
}
