import {
  MigrationInterface,
  QueryRunner,
  Table,
  type TableColumnOptions,
  type TableIndexOptions,
} from 'typeorm';

/**
 * 桌位域：`store_table`（一桌一码）。
 *
 * 表结构之外不写任何数据：桌位由商家在「桌位管理」里新增，
 * 小程序码在保存时调微信接口生成，灌假数据既没有二维码也没有意义。
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

function storeTable(): Table {
  return new Table({
    name: 'store_table',
    engine: TABLE_ENGINE,
    comment: '门店桌位（一桌一码）',
    columns: [
      idColumn(),
      ...timestampColumns(),
      merchantIdColumn(),
      varchar('table_no', 32, '桌号，店内唯一，如 A01 / 8号桌'),
      varchar('qr_token', 64, '扫码令牌，全局唯一，小程序码 scene 里携带它而不是桌号明文'),
      varchar('qr_code_url', 255, '小程序码图片地址；生成失败时为空，可在商家端重新生成', nullable()),
      varchar('area', 32, '区域，如「一楼大厅」', nullable()),
      integer('seats', '座位数，仅作提示', nullable()),
      varchar('status', 16, '状态 active=启用 | disabled=停用', {
        default: literal('active'),
      }),
      integer('sort', '排序，越小越靠前', { default: 0 }),
    ],
    indices: [
      index('idx_store_table_merchant_id', ['merchant_id']),
      index('idx_store_table_merchant_id_sort', ['merchant_id', 'sort']),
      index('uk_store_table_merchant_no', ['merchant_id', 'table_no'], true),
      index('uk_store_table_qr_token', ['qr_token'], true),
    ],
  });
}

export class AddStoreTable1792000000000 implements MigrationInterface {
  name = 'AddStoreTable1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(storeTable());
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('store_table', true);
  }
}
