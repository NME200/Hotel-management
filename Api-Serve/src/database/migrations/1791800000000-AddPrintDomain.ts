import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  type TableColumnOptions,
  type TableIndexOptions,
} from 'typeorm';

/**
 * 小票打印域：`printer`（打印机配置）+ `print_task`（打印任务流水），
 * 同时给 `store` 补上三个自动打印开关。
 *
 * 表结构之外不写任何数据：演示打印机由 `pnpm seed:printer` 走商家端接口灌进去，
 * 这样种子数据天然带上正确的 merchant_id，也顺带验证了写接口。
 *
 * 与既有迁移一致：只用 SchemaBuilder 声明式 API，文件里不出现任何语句文本。
 */

const TABLE_ENGINE = 'InnoDB';
const DATETIME_PRECISION = 6;
const CURRENT_TIMESTAMP_6 = 'CURRENT_TIMESTAMP(6)';

function literal(value: string | number): string {
  return typeof value === 'number' ? `${value}` : `'${value}'`;
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

function merchantIdColumn(): TableColumnOptions {
  return { name: 'merchant_id', type: 'int', comment: '所属商户 ID（租户键）' };
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

function printerTable(): Table {
  return new Table({
    name: 'printer',
    engine: TABLE_ENGINE,
    comment: '商家打印机配置',
    columns: [
      idColumn(),
      ...timestampColumns(),
      merchantIdColumn(),
      varchar('name', 64, '打印机名称，商家自己识别用'),
      varchar('mode', 16, '打印方式 browser=浏览器小票机 | cloud=云打印机', {
        default: literal('browser'),
      }),
      varchar('ticket_type', 16, '负责的票种 customer=顾客小票 | kitchen=后厨小票', {
        default: literal('customer'),
      }),
      varchar('paper_size', 8, '纸张宽度 58mm | 80mm', { default: literal('80mm') }),
      varchar('status', 16, '状态 active=启用 | disabled=停用', {
        default: literal('active'),
      }),
      integer('copies', '该票种默认打印份数', { default: 1 }),
      varchar('provider', 32, '云打印机厂商机器码 feie|yilianyun，browser 模式为空', nullable()),
      varchar('device_no', 64, '云打印机设备号（sn），browser 模式为空', nullable()),
      varchar('remark', 255, '备注，例如「前台收银机」', nullable()),
    ],
    indices: [
      index('idx_printer_merchant_id', ['merchant_id']),
      index('idx_printer_merchant_id_status', ['merchant_id', 'status']),
      index('idx_printer_merchant_id_ticket_type', ['merchant_id', 'ticket_type']),
    ],
  });
}

function printTaskTable(): Table {
  return new Table({
    name: 'print_task',
    engine: TABLE_ENGINE,
    comment: '小票打印任务流水',
    columns: [
      idColumn(),
      ...timestampColumns(),
      merchantIdColumn(),
      integer('order_id', '关联订单 ID'),
      varchar('order_no', 32, '订单号快照，订单被清时仍能追溯'),
      varchar('ticket_type', 16, '票种 customer=顾客小票 | kitchen=后厨小票', {
        default: literal('customer'),
      }),
      varchar('mode', 16, '打印方式快照 browser | cloud', {
        default: literal('browser'),
      }),
      varchar('printer_name', 64, '打印机名称快照，未配置打印机时为空', nullable()),
      integer('copies', '实际打印份数', { default: 1 }),
      varchar('status', 16, '任务状态 pending=待打印 | success=已打印 | failed=打印失败', {
        default: literal('pending'),
      }),
      integer('retry_count', '已重试次数', { default: 0 }),
      varchar('fail_reason', 255, '失败原因，成功时为空', nullable()),
      varchar('trigger', 32, '触发来源 auto=出餐自动打印 | manual=手动打印 | retry=失败重试', nullable()),
      integer('operator_id', '操作人 ID，自动打印时为空', nullable()),
      varchar('operator_name', 64, '操作人姓名快照', nullable()),
      {
        name: 'printed_at',
        type: 'datetime',
        isNullable: true,
        comment: '打印成功时间，未成功时为空',
      },
    ],
    indices: [
      index('idx_print_task_merchant_id_status_created_at', [
        'merchant_id',
        'status',
        'created_at',
      ]),
      index('idx_print_task_merchant_id_order_id', ['merchant_id', 'order_id']),
    ],
  });
}

export class AddPrintDomain1791800000000 implements MigrationInterface {
  name = 'AddPrintDomain1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(printerTable());
    await queryRunner.createTable(printTaskTable());

    await queryRunner.addColumns('store', [
      new TableColumn({
        name: 'auto_print',
        type: 'boolean',
        default: literal(0),
        comment: '接单后自动打印小票：关掉后只能手动点打印，避免默认打扰',
      }),
      new TableColumn({
        name: 'auto_print_on',
        type: 'varchar',
        length: '16',
        default: literal('accepted'),
        comment: '自动打印触发时机 accepted=接单后 | ready=出餐后',
      }),
      new TableColumn({
        name: 'customer_copies',
        type: 'int',
        default: literal(1),
        comment: '顾客小票默认份数，后厨小票份数在 printer 上按台配置',
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('store', ['auto_print', 'auto_print_on', 'customer_copies']);
    await queryRunner.dropTable('print_task', true);
    await queryRunner.dropTable('printer', true);
  }
}
