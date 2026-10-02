import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/**
 * 平台侧操作审计：只记录"谁在什么时候对什么做了什么"，
 * 不记录商户业务数据本身，因此不属于租户表。
 */
@Entity('platform_audit', { comment: '平台操作审计日志' })
@Index(['action', 'createdAt'])
@Index(['operatorId', 'createdAt'])
@Index(['targetType', 'targetId'])
export class PlatformAudit extends BaseEntity {
  @Column({ type: 'int', nullable: true, comment: '操作人 ID' })
  operatorId!: number | null;

  @Column({ type: 'varchar', length: 64, comment: '操作人名称快照' })
  operatorName!: string;

  @Column({ type: 'varchar', length: 16, comment: '操作人类型 platform|merchant' })
  operatorType!: string;

  @Index()
  @Column({ type: 'varchar', length: 48, comment: '操作机器码，如 merchant.create' })
  action!: string;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '对象类型 merchant|account' })
  targetType!: string | null;

  @Column({ type: 'int', nullable: true, comment: '对象 ID' })
  targetId!: number | null;

  @Column({ type: 'varchar', length: 128, nullable: true, comment: '对象名称快照' })
  targetName!: string | null;

  @Column({ type: 'simple-json', nullable: true, comment: '变更明细' })
  detail!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '来源 IP' })
  ip!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: 'User-Agent' })
  userAgent!: string | null;
}
