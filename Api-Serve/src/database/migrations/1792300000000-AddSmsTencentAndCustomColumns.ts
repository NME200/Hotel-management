import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * `sms_config` 扩到四通道：新增腾讯云与自定义网关要用的列。
 *
 * 只加列、不塞数据：通道与凭据必须由平台管理员在后台录入，用 SQL 灌一份占位值
 * 反而会让人以为「已经配好了」。表里没配的字段在运行时回落 `.env`。
 *
 * 云厂商那对凭据**沿用原有的** `access_key_id` / `access_key_secret_encrypted`：
 * 阿里云叫 AccessKey ID/Secret，腾讯云叫 SecretId/SecretKey，是同一对凭据的两个名字，
 * 按厂商另开列只会让表里长出四份几乎一样的字段（与 `print_provider_config` 同一条口径）。
 *
 * 与既有迁移一致：只用 SchemaBuilder 声明式 API，文件里不出现任何语句文本。
 */

function column(
  name: string,
  type: string,
  comment: string,
  options: { length?: string } = {},
): TableColumn {
  return new TableColumn({
    name,
    type,
    length: options.length,
    isNullable: true,
    comment,
  });
}

const NEW_COLUMNS = (): TableColumn[] => [
  column('sdk_app_id', 'varchar', '腾讯云短信应用 SdkAppId', { length: '64' }),
  column(
    'custom_body_template',
    'text',
    '自定义通道请求体 JSON 模板，占位符 {phone} {code} {signName} {templateCode}',
  ),
  column(
    'custom_auth_header',
    'varchar',
    '自定义通道鉴权头，形如 Authorization: Bearer {token}',
    { length: '255' },
  ),
  column('custom_token_encrypted', 'text', '自定义通道网关密钥（AES-256-GCM 密文）'),
];

const OLD_DRIVER_COMMENT = '通道 log|aliyun，空则回落 .env';
const NEW_DRIVER_COMMENT = '通道 log|aliyun|tencent|custom，空则回落 .env';

/** 这几列的注释还写着「阿里云」，通道扩档后会误导人，只改注释不改类型。 */
const COMMENT_ONLY_UPDATES = (): TableColumn[] => [
  column('driver', 'varchar', NEW_DRIVER_COMMENT, { length: '16' }),
  column('access_key_id', 'varchar', '云厂商 AccessKey ID / 腾讯云 SecretId（明文）', {
    length: '64',
  }),
  column('access_key_secret_encrypted', 'text', '云厂商 AccessKey Secret / 腾讯云 SecretKey（AES-256-GCM 密文）'),
  column('template_code', 'varchar', '验证码模板号（阿里云 SMS_xxx / 腾讯云数字模板 ID），变量名固定为 code', {
    length: '64',
  }),
  column('region', 'varchar', '地域，如 cn-hangzhou / ap-guangzhou', { length: '32' }),
];

export class AddSmsTencentAndCustomColumns1792300000000 implements MigrationInterface {
  name = 'AddSmsTencentAndCustomColumns1792300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('sms_config', NEW_COLUMNS());
    for (const item of COMMENT_ONLY_UPDATES()) {
      await queryRunner.changeColumn('sms_config', item.name, item);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('sms_config', [
      'sdk_app_id',
      'custom_body_template',
      'custom_auth_header',
      'custom_token_encrypted',
    ]);
    await queryRunner.changeColumn(
      'sms_config',
      'driver',
      column('driver', 'varchar', OLD_DRIVER_COMMENT, { length: '16' }),
    );
  }
}
