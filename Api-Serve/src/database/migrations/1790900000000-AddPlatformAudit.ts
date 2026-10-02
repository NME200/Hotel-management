import {
  MigrationInterface,
  QueryRunner,
  Table,
  type TableColumnOptions,
  type TableIndexOptions,
} from 'typeorm';

/**
 * 新增平台操作审计表 platform_audit。
 *
 * 与 InitSchema 一致：只用 TypeORM 的 SchemaBuilder 声明结构，
 * 本文件不出现任何 SQL 语句文本（DESIGN.md 硬性要求）。
 * 结构对应 src/database/entities/platform-audit.entity.ts。
 */

const TABLE_ENGINE = 'InnoDB';
const DATETIME_PRECISION = 6;
const CURRENT_TIMESTAMP_6 = 'CURRENT_TIMESTAMP(6)';

function idColumn(): TableColumnOptions {
  return {
    name: 'id',
    type: 'int',
    isPrimary: true,
    isGenerated: true,
    generationStrategy: 'increment',
    comment: '主键 ID',
  };
}

function timestampColumns(): TableColumnOptions[] {
  return [
    {
      name: 'created_at',
      type: 'datetime',
      precision: DATETIME_PRECISION,
      default: CURRENT_TIMESTAMP_6,
      comment: '创建时间',
    },
    {
      name: 'updated_at',
      type: 'datetime',
      precision: DATETIME_PRECISION,
      default: CURRENT_TIMESTAMP_6,
      onUpdate: CURRENT_TIMESTAMP_6,
      comment: '更新时间',
    },
  ];
}

function varchar(
  name: string,
  length: number,
  comment: string,
  options: Partial<TableColumnOptions> = {},
): TableColumnOptions {
  return { name, type: 'varchar', length: `${length}`, comment, ...options };
}

function integer(
  name: string,
  comment: string,
  options: Partial<TableColumnOptions> = {},
): TableColumnOptions {
  return { name, type: 'int', comment, ...options };
}

function nullable(): Partial<TableColumnOptions> {
  return { isNullable: true };
}

function index(
  name: string,
  columnNames: string[],
  isUnique = false,
): TableIndexOptions {
  return { name, columnNames, isUnique };
}

function platformAuditTable(): Table {
  return new Table({
    name: 'platform_audit',
    engine: TABLE_ENGINE,
    comment: '平台操作审计日志',
    columns: [
      idColumn(),
      ...timestampColumns(),
      integer('operator_id', '操作人 ID', nullable()),
      varchar('operator_name', 64, '操作人名称快照'),
      varchar('operator_type', 16, '操作人类型 platform|merchant'),
      varchar('action', 48, '操作机器码，如 merchant.create'),
      varchar('target_type', 32, '对象类型 merchant|account', nullable()),
      integer('target_id', '对象 ID', nullable()),
      varchar('target_name', 128, '对象名称快照', nullable()),
      {
        name: 'detail',
        type: 'text',
        isNullable: true,
        comment: '变更明细 JSON',
      },
      varchar('ip', 64, '来源 IP', nullable()),
      varchar('user_agent', 255, 'User-Agent', nullable()),
    ],
    indices: [
      index('idx_platform_audit_action', ['action']),
      index('idx_platform_audit_action_created_at', ['action', 'created_at']),
      index('idx_platform_audit_operator_id_created_at', ['operator_id', 'created_at']),
      index('idx_platform_audit_target_type_target_id', ['target_type', 'target_id']),
    ],
  });
}

export class AddPlatformAudit1790900000000 implements MigrationInterface {
  name = 'AddPlatformAudit1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(platformAuditTable());
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('platform_audit', true);
  }
}
