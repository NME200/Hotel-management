import {
  MigrationInterface,
  QueryRunner,
  Table,
  type TableColumnOptions,
  type TableIndexOptions,
} from 'typeorm';

/**
 * 新增对账两张表：payment_reconcile（台账）+ payment_reconcile_detail（差异明细）。
 *
 * 与 InitSchema / AddPlatformAudit / AddPaymentDomain / AddPaymentConfig /
 * AddProfitShare 一致：只用 TypeORM 的 SchemaBuilder 声明式 API
 * （new Table / createTable），建表方言交给 MySQL 驱动按实体与
 * SnakeNamingStrategy 推导，本文件不出现任何语句文本（DESIGN.md 硬性要求）。
 *
 * 结构要点：
 * - payment_reconcile 继承 TenantBaseEntity，粒度是「商户 × 渠道 × 自然日」，
 *   唯一索引 (merchant_id, channel, trade_date) 保证每日每商户每渠道只有一份台账，
 *   重跑对账是 UPSERT 而不是新增一行；
 * - payment_reconcile_detail 只继承 BaseEntity（明细归属由台账承担），
 *   唯一索引 (reconcile_id, channel, out_trade_no) 让重跑对账天然幂等；
 * - 金额一律整数分（amount_cents / fee_cents / refund_cents），与支付表口径一致；
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

function baseColumns(): TableColumnOptions[] {
  return [idColumn(), ...timestampColumns()];
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

function reconcileTable(): Table {
  return new Table({
    name: 'payment_reconcile',
    engine: TABLE_ENGINE,
    comment: '对账台账（本地账 vs 渠道账）',
    columns: [
      ...tenantColumns(),
      varchar('reconcile_no', 32, '对账单号，每商户每渠道每日一份'),
      varchar('channel', 16, '支付渠道'),
      { name: 'trade_date', type: 'date', comment: '对账日（自然日）' },
      integer('channel_count', '渠道账笔数', { default: 0 }),
      integer('channel_amount_cents', '渠道账金额合计（分）', { default: 0 }),
      integer('channel_fee_cents', '渠道手续费合计（分）', { default: 0 }),
      integer('local_count', '本地账笔数', { default: 0 }),
      integer('local_amount_cents', '本地账金额合计（分）', { default: 0 }),
      integer('local_refund_cents', '本地当日退款金额（分）', { default: 0 }),
      integer('diff_count', '差异笔数', { default: 0 }),
      integer('diff_amount_cents', '差异金额合计（分）', { default: 0 }),
      varchar('status', 16, '状态 pending_bill|running|balanced|mismatch|failed', {
        default: literal('pending_bill'),
      }),
      {
        name: 'bill_downloaded',
        type: 'boolean',
        default: false,
        comment: '渠道账单是否已成功取到',
      },
      {
        name: 'bill_fetched_at',
        type: 'datetime',
        isNullable: true,
        comment: '渠道账单下载完成时间',
      },
      integer('retry_count', '台账重试次数', { default: 0 }),
      { name: 'next_retry_at', type: 'datetime', isNullable: true, comment: '下次重试时间' },
      { name: 'reconciled_at', type: 'datetime', isNullable: true, comment: '对账完成时间' },
      varchar('failure_reason', 255, '失败/未完成原因', nullable()),
    ],
    indices: [
      index('idx_payment_reconcile_reconcile_no', ['reconcile_no'], true),
      index(
        'idx_payment_reconcile_merchant_channel_date',
        ['merchant_id', 'channel', 'trade_date'],
        true,
      ),
      index('idx_payment_reconcile_trade_date_status', ['trade_date', 'status']),
      index('idx_payment_reconcile_status_next_retry_at', ['status', 'next_retry_at']),
      index('idx_payment_reconcile_merchant_id', ['merchant_id']),
    ],
  });
}

function reconcileDetailTable(): Table {
  return new Table({
    name: 'payment_reconcile_detail',
    engine: TABLE_ENGINE,
    comment: '对账差异明细',
    columns: [
      ...baseColumns(),
      integer('reconcile_id', '所属对账台账 ID'),
      integer('merchant_id', '所属商户 ID（冗余）'),
      varchar('channel', 16, '支付渠道'),
      varchar('diff_type', 32, '差异类型'),
      varchar('out_trade_no', 32, '商户支付单号，对账关联键'),
      integer('payment_id', '本地支付单 ID', nullable()),
      integer('channel_amount_cents', '渠道侧金额（分）', nullable()),
      integer('local_amount_cents', '本地侧金额（分）', nullable()),
      integer('diff_amount_cents', '差异金额（分）', { default: 0 }),
      varchar('channel_trade_no', 64, '渠道交易号', nullable()),
      varchar('local_trade_no', 64, '本地交易号', nullable()),
      varchar('remark', 255, '差异说明'),
      {
        name: 'channel_paid_at',
        type: 'datetime',
        isNullable: true,
        comment: '渠道账单里该笔的记账时间',
      },
      { name: 'raw_channel', type: 'json', isNullable: true, comment: '渠道账单原始明细快照' },
    ],
    indices: [
      index(
        'idx_payment_reconcile_detail_reconcile_channel_trade',
        ['reconcile_id', 'channel', 'out_trade_no'],
        true,
      ),
      index('idx_payment_reconcile_detail_reconcile_diff', ['reconcile_id', 'diff_type']),
      index('idx_payment_reconcile_detail_merchant_id', ['merchant_id']),
    ],
  });
}

export class AddReconcile1791300000000 implements MigrationInterface {
  name = 'AddReconcile1791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(reconcileTable());
    await queryRunner.createTable(reconcileDetailTable());
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('payment_reconcile_detail', true);
    await queryRunner.dropTable('payment_reconcile', true);
  }
}
