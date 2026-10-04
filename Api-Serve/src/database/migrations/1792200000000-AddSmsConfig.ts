import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * 短信验证码配置表：`sms_config`（平台侧，全局一行）。
 *
 * 只建表不塞数据：通道与凭据必须由平台管理员在后台录入，
 * 用 SQL 灌一份占位值反而会让人以为「已经配好了」。
 * 表里没配的字段在运行时回落 `.env`。
 *
 * 与既有迁移一致：只用 SchemaBuilder 声明式 API，文件里不出现任何语句文本。
 */

const TABLE_ENGINE = 'InnoDB';
const DATETIME_PRECISION = 6;
const CURRENT_TIMESTAMP_6 = 'CURRENT_TIMESTAMP(6)';

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

function smsConfigTable(): Table {
  return new Table({
    name: 'sms_config',
    engine: TABLE_ENGINE,
    comment: '短信验证码配置（全局单行）',
    columns: [
      idColumn(),
      ...timestampColumns(),
      {
        name: 'slot',
        type: 'varchar',
        length: '16',
        default: "'global'",
        comment: '配置槽位，全局只有一行',
      },
      {
        name: 'enabled',
        type: 'tinyint',
        width: 1,
        default: 0,
        comment: '短信验证码总开关',
      },
      {
        name: 'driver',
        type: 'varchar',
        length: '16',
        isNullable: true,
        comment: '通道 log|aliyun，空则回落 .env',
      },
      {
        name: 'access_key_id',
        type: 'varchar',
        length: '64',
        isNullable: true,
        comment: '阿里云 AccessKey ID（明文）',
      },
      {
        name: 'access_key_secret_encrypted',
        type: 'text',
        isNullable: true,
        comment: '阿里云 AccessKey Secret（AES-256-GCM 密文）',
      },
      {
        name: 'sign_name',
        type: 'varchar',
        length: '64',
        isNullable: true,
        comment: '短信签名，如「川味小馆」',
      },
      {
        name: 'template_code',
        type: 'varchar',
        length: '64',
        isNullable: true,
        comment: '验证码模板 CODE，变量名固定为 code',
      },
      {
        name: 'region',
        type: 'varchar',
        length: '32',
        isNullable: true,
        comment: '地域，如 cn-hangzhou',
      },
      {
        name: 'endpoint',
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
  });
}

const SLOT_INDEX = new TableIndex({
  name: 'IDX_sms_config_slot',
  columnNames: ['slot'],
  isUnique: true,
});

export class AddSmsConfig1792200000000 implements MigrationInterface {
  name = 'AddSmsConfig1792200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(smsConfigTable(), true);
    await queryRunner.createIndex('sms_config', SLOT_INDEX);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('sms_config', SLOT_INDEX);
    await queryRunner.dropTable('sms_config');
  }
}
