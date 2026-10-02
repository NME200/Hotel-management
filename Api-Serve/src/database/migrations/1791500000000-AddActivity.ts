import {
  MigrationInterface,
  QueryRunner,
  Table,
  type TableColumnOptions,
  type TableIndexOptions,
} from 'typeorm';

/**
 * 运营位活动表 `activity`：商户自助配置的首页 Banner、「我的」页色块卡、会员中心活动区文案。
 *
 * 表结构之外不写任何数据：测试活动由 `pnpm seed:activity` 走商家端接口灌进去，
 * 这样种子数据天然带上正确的 merchant_id，也顺带验证了写接口。
 *
 * 与既有迁移一致：只用 SchemaBuilder 声明式 API，文件里不出现任何语句文本。
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

function timeColumn(name: string, comment: string): TableColumnOptions {
  return { name, type: 'datetime', isNullable: true, comment };
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

function activityTable(): Table {
  return new Table({
    name: 'activity',
    engine: TABLE_ENGINE,
    comment: '运营位活动',
    columns: [
      idColumn(),
      ...timestampColumns(),
      { name: 'merchant_id', type: 'int', comment: '所属商户 ID（租户键）' },
      varchar('name', 64, '活动名称，只在商家端识别用，不上小程序'),
      varchar('slot', 16, '展示位 home|mine|member', { default: literal('home') }),
      varchar('title', 64, '顾客端主标题'),
      varchar('sub_title', 128, '顾客端副标题', nullable()),
      varchar('icon', 16, '图标机器码，前端映射成品牌色字符', nullable()),
      varchar('action', 16, '点击跳转 none|coupons|menu|member|stores|search', {
        default: literal('none'),
      }),
      timeColumn('starts_at', '生效开始时间，空表示立即生效'),
      timeColumn('ends_at', '生效结束时间，空表示长期有效'),
      varchar('status', 16, '状态 enabled|disabled', { default: literal('enabled') }),
      integer('sort', '排序值，越小越靠前', { default: 0 }),
    ],
    indices: [
      index('idx_activity_merchant_id', ['merchant_id']),
      index('idx_activity_merchant_id_slot_status', ['merchant_id', 'slot', 'status']),
      index('idx_activity_merchant_id_starts_at_ends_at', ['merchant_id', 'starts_at', 'ends_at']),
    ],
  });
}

export class AddActivity1791500000000 implements MigrationInterface {
  name = 'AddActivity1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(activityTable());
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('activity', true);
  }
}
