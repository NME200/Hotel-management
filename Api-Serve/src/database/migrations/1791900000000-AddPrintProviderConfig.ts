import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/**
 * 云打印机厂商配置表：`print_provider_config`（平台侧，每厂商一行）。
 *
 * 表结构之外不写任何数据：密钥只能由平台管理员在后台录入，
 * 用 SQL 灌一份假密钥反而会让人以为"已经配好了"。
 *
 * 与既有迁移一致：只用 SchemaBuilder 声明式 API，文件里不出现任何语句文本。
 */

const TABLE_ENGINE = 'InnoDB';
const DATETIME_PRECISION = 6;
const CURRENT_TIMESTAMP_6 = 'CURRENT_TIMESTAMP(6)';

function literal(value: string | number): string {
  return typeof value === 'number' ? `${value}` : `'${value}'`;
}

function idColumn() {
  return {
    name: 'id',
    type: 'int',
    isPrimary: true,
    isGenerated: true,
    generationStrategy: 'increment' as const,
    comment: '主键 ID',
  };
}

function timestampColumns() {
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

function printProviderConfigTable(): Table {
  return new Table({
    name: 'print_provider_config',
    engine: TABLE_ENGINE,
    comment: '云打印机厂商配置（平台侧）',
    columns: [
      idColumn(),
      ...timestampColumns(),
      {
        name: 'provider',
        type: 'varchar',
        length: '32',
        comment: '厂商机器码 feie|yilianyun',
      },
      {
        name: 'enabled',
        type: 'boolean',
        default: literal(0),
        comment: '平台侧厂商总开关',
      },
      {
        name: 'uid',
        type: 'varchar',
        length: '64',
        isNullable: true,
        comment: '飞鹅账号 uid',
      },
      {
        name: 'client_id',
        type: 'varchar',
        length: '64',
        isNullable: true,
        comment: '易联云应用 client_id',
      },
      {
        name: 'api_key_encrypted',
        type: 'text',
        isNullable: true,
        comment: '飞鹅 apikey（密文）',
      },
      {
        name: 'client_secret_encrypted',
        type: 'text',
        isNullable: true,
        comment: '易联云 client_secret（密文）',
      },
      {
        name: 'base_url',
        type: 'varchar',
        length: '255',
        isNullable: true,
        comment: '网关地址覆盖，留空用官方地址',
      },
      {
        name: 'updated_by_id',
        type: 'int',
        isNullable: true,
        comment: '最后修改人 ID',
      },
      {
        name: 'updated_by_name',
        type: 'varchar',
        length: '64',
        isNullable: true,
        comment: '最后修改人姓名',
      },
    ],
    indices: [{ name: 'idx_print_provider_config_provider', columnNames: ['provider'], isUnique: true }],
  });
}

export class AddPrintProviderConfig1791900000000 implements MigrationInterface {
  name = 'AddPrintProviderConfig1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(printProviderConfigTable());
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('print_provider_config', true);
  }
}
