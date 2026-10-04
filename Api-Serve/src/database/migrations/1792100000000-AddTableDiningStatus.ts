import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

/**
 * 桌位用餐状态：给 `store_table` 补上开台/清台需要的三个字段。
 *
 * 与 `status`（启用/停用）分开是有意的：一张桌可以「正在用餐」同时「被临时停用」，
 * 两个状态正交，塞进同一个字段就没法表达。
 *
 * 与既有迁移一致：只用 SchemaBuilder 声明式 API，文件里不出现任何语句文本。
 */

const COLUMNS: TableColumn[] = [
  new TableColumn({
    name: 'dining_status',
    type: 'varchar',
    length: '16',
    default: "'idle'",
    comment: '用餐状态 idle=空闲 | dining=用餐中（由收银台开台/清台维护）',
  }),
  new TableColumn({
    name: 'guest_count',
    type: 'int',
    isNullable: true,
    comment: '开台时登记的就餐人数',
  }),
  new TableColumn({
    name: 'opened_at',
    type: 'datetime',
    isNullable: true,
    comment: '开台时间，看板据此算用餐时长',
  }),
];

const DINING_INDEX = new TableIndex({
  name: 'idx_store_table_merchant_id_dining_status',
  columnNames: ['merchant_id', 'dining_status'],
});

export class AddTableDiningStatus1792100000000 implements MigrationInterface {
  name = 'AddTableDiningStatus1792100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const column of COLUMNS) {
      await queryRunner.addColumn('store_table', column);
    }
    await queryRunner.createIndex('store_table', DINING_INDEX);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('store_table', DINING_INDEX);
    for (const column of [...COLUMNS].reverse()) {
      await queryRunner.dropColumn('store_table', column.name);
    }
  }
}
