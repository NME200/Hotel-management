import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
  type TableColumnOptions,
  type TableIndexOptions,
} from 'typeorm';

/**
 * 限时活动 `promotion`：会真正改成交价的那种活动。
 *
 * 与上一轮的 `activity`（运营位，只改文案）分表：运营位说的是「本店今天推什么」，
 * promotion 决定「这道菜按多少钱卖」，两者的生命周期和审核口径都不一样，混在一张表里
 * 迟早会出现「卡片写着 6 折、结算没打折」这种自相矛盾。
 *
 * 同时给 `activity` 加 promotion_id：卡片可以绑定一个真实活动，顾客点进去只看参与的菜。
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

function text(name: string, comment: string, options: Partial<TableColumnOptions> = {}): TableColumnOptions {
  return { name, type: 'text', comment, ...options };
}

function ratio(name: string, comment: string): TableColumnOptions {
  return { name, type: 'decimal', precision: 5, scale: 4, isNullable: true, comment };
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

function promotionTable(): Table {
  return new Table({
    name: 'promotion',
    engine: TABLE_ENGINE,
    comment: '限时活动',
    columns: [
      idColumn(),
      ...timestampColumns(),
      { name: 'merchant_id', type: 'int', comment: '所属商户 ID（租户键）' },
      varchar('name', 64, '活动名称，只在商家端识别用'),
      varchar('badge', 16, '顾客端角标文字，空则用默认「活动」', nullable()),
      varchar('type', 16, '优惠算法 price=活动价|discount=折扣', { default: literal('price') }),
      integer('price_cents', 'type=price：活动价（分），基于菜品基础价', nullable()),
      ratio('discount_ratio', 'type=discount：实付比例，0.6000 表示 6 折'),
      varchar('scope_type', 16, '适用范围 all|category|dish', { default: literal('all') }),
      text('scope_ids', 'scope_type 非 all 时的 ID 列表', nullable()),
      timeColumn('starts_at', '开始时间，空表示立即开始'),
      timeColumn('ends_at', '结束时间，空表示长期有效'),
      varchar('status', 16, '状态 enabled|disabled', { default: literal('enabled') }),
    ],
    indices: [
      index('idx_promotion_merchant_id', ['merchant_id']),
      index('idx_promotion_merchant_id_status', ['merchant_id', 'status']),
      index('idx_promotion_merchant_id_starts_at_ends_at', ['merchant_id', 'starts_at', 'ends_at']),
    ],
  });
}

export class AddPromotion1791600000000 implements MigrationInterface {
  name = 'AddPromotion1791600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(promotionTable());
    await queryRunner.addColumns(
      'activity',
      [
        integer(
          'promotion_id',
          '关联的限时活动 ID，空表示纯展示卡',
          nullable(),
        ),
      ].map((options) => new TableColumn(options)),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('activity', ['promotion_id']);
    await queryRunner.dropTable('promotion', true);
  }
}
