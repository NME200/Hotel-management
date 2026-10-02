import {
  Column,
  CreateDateColumn,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export abstract class BaseEntity {
  @PrimaryGeneratedColumn({ comment: '主键 ID' })
  id!: number;

  @CreateDateColumn({ comment: '创建时间' })
  createdAt!: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updatedAt!: Date;
}

/**
 * 租户（商户）隔离基表：merchant_id 既是数据归属键，
 * 也是所有业务查询的强制过滤条件，由 TenantRepo 统一注入。
 */
export abstract class TenantBaseEntity extends BaseEntity {
  @Index()
  @Column({ type: 'int', comment: '所属商户 ID（租户键）' })
  merchantId!: number;
}
