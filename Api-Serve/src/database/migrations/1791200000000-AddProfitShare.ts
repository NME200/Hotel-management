import {
  MigrationInterface,
  QueryRunner,
  Table,
  type TableColumnOptions,
  type TableIndexOptions,
} from 'typeorm';

/**
 * 新增分账单表 profit_share（服务商模式平台抽佣）。
 *
 * 与 InitSchema / AddPlatformAudit / AddPaymentDomain / AddPaymentConfig 一致：
 * 只用 TypeORM 的 SchemaBuilder 声明式 API（new Table / createTable），
 * 建表方言交给 MySQL 驱动按实体与 SnakeNamingStrategy 推导，
 * 本文件不出现任何语句文本（DESIGN.md 硬性要求）。
 *
 * 结构与 ProfitShare 实体一一对应：
 * - 继承 TenantBaseEntity，公共列 + merchant_id；
 * - share_no 唯一（渠道侧幂等键）；(payment_id, receiver_type) 唯一
 *   保证同一支付单同一接收方只生成一行；(merchant_id, status, created_at)
 *   与 (status, unfreeze_at) 分别服务"商户维度翻账"与"到期解冻扫描"；
 * - amount_cents 为整数分，rate 为 decimal(6,4) 的比率快照；
 * - 不建外键，归属关系由应用层保证，理由与既有支付表一致。
 */
const TABLE_ENGINE = 'InnoDB';
const DATETIME_PRECISION = 6;
const CURRENT_TIMESTAMP_6 = 'CURRENT_TIMESTAMP(6)';

function literal(value: string): string {
  return `'${value}'`;
}

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

function tenantColumns(): TableColumnOptions[] {
  return [
    idColumn(),
    ...timestampColumns(),
    { name: 'merchant_id', type: 'int', comment: '所属商户 ID（租户键）' },
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

function profitShareTable(): Table {
  return new Table({
    name: 'profit_share',
    engine: TABLE_ENGINE,
    comment: '分账单（服务商模式平台抽佣）',
    columns: [
      ...tenantColumns(),
      varchar('share_no', 32, '分账单号，渠道侧幂等键'),
      integer('payment_id', '支付单 ID'),
      integer('order_id', '订单 ID'),
      varchar('channel', 16, '支付渠道'),
      varchar('receiver_type', 16, '接收方类型 platform|merchant'),
      varchar('receiver_account', 64, '接收方账户', nullable()),
      integer('amount_cents', '分账金额（分）'),
      {
        name: 'rate',
        type: 'decimal',
        precision: 6,
        scale: 4,
        isNullable: true,
        comment: '生成时的抽佣比率快照',
      },
      varchar('status', 16, '状态 pending|frozen|unfreezing|unfrozen|failed', {
        default: literal('pending'),
      }),
      varchar('channel_share_id', 64, '渠道分账单号', nullable()),
      { name: 'unfreeze_at', type: 'datetime', comment: '计划解冻时间（T+N）' },
      {
        name: 'unfrozen_at',
        type: 'datetime',
        isNullable: true,
        comment: '实际解冻完成时间',
      },
      integer('retry_count', '解冻重试次数', { default: 0 }),
      varchar('failure_reason', 255, '失败原因', nullable()),
    ],
    indices: [
      index('idx_profit_share_share_no', ['share_no'], true),
      index('idx_profit_share_payment_id_receiver_type', ['payment_id', 'receiver_type'], true),
      index('idx_profit_share_merchant_id_status_created_at', ['merchant_id', 'status', 'created_at']),
      index('idx_profit_share_status_unfreeze_at', ['status', 'unfreeze_at']),
      index('idx_profit_share_merchant_id', ['merchant_id']),
    ],
  });
}

export class AddProfitShare1791200000000 implements MigrationInterface {
  name = 'AddProfitShare1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(profitShareTable());
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('profit_share', true);
  }
}
