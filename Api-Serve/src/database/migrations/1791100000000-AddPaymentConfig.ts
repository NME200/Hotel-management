import {
  MigrationInterface,
  QueryRunner,
  Table,
  type TableColumnOptions,
  type TableIndexOptions,
} from 'typeorm';

/**
 * 新增支付配置层：payment_channel_config / merchant_payment_config 两张表。
 *
 * 与 InitSchema、AddPlatformAudit、AddPaymentDomain 一致：这里只用 TypeORM 的
 * SchemaBuilder 声明式 API（new Table / createTable / dropTable），
 * 具体的建表方言由 MySQL 驱动根据实体与 SnakeNamingStrategy 生成，
 * 本文件不出现任何语句文本（DESIGN.md 硬性要求）。
 *
 * 结构与实体一一对应：
 * - PaymentChannelConfig 继承 BaseEntity（平台侧表），没有租户键列，
 *   渠道维度每渠道一行，channel 上唯一；
 * - MerchantPaymentConfig 继承 TenantBaseEntity，公共列 + merchant_id，
 *   (merchant_id, channel) 唯一、(status, created_at) 与普通 merchant_id 索引
 *   对应实体上的两个 @Index 与基类 @Index；
 * - 列名 snake_case，索引名沿用命名策略推导出的 idx_ 前缀结果（唯一索引用
 *   idx_ 而非 uk_，与 InitSchema 里 @Index(..., { unique: true }) 的落库结果一致）；
 * - 不建外键，理由见文末 FK 说明。
 *
 * 不做的事：
 * - 不预置任何行。渠道级配置由 PaymentConfigService 按渠道枚举合成，
 *   首次保存时按 (merchant_id, channel) 或 channel 写入，无需种子数据。
 */

const TABLE_ENGINE = 'InnoDB';
const DATETIME_PRECISION = 6;
const CURRENT_TIMESTAMP_6 = 'CURRENT_TIMESTAMP(6)';

/**
 * SchemaBuilder 的默认值会原样落到列定义里，
 * 因此字面量需要写成带单引号的数据库字面量形式。
 */
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

function merchantIdColumn(options: Partial<TableColumnOptions> = {}): TableColumnOptions {
  return { name: 'merchant_id', type: 'int', comment: '所属商户 ID（租户键）', ...options };
}

/** 公共列（非租户表）。 */
function baseColumns(): TableColumnOptions[] {
  return [idColumn(), ...timestampColumns()];
}

/** 公共列 + 租户键（业务表）。 */
function tenantColumns(): TableColumnOptions[] {
  return [...baseColumns(), merchantIdColumn()];
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

/** 密文/大文本列，可空。 */
function textColumn(name: string, comment: string): TableColumnOptions {
  return { name, type: 'text', isNullable: true, comment };
}

/** 布尔列在 MySQL 落为 tinyint，false -> 0 / true -> 1。 */
function booleanColumn(
  name: string,
  comment: string,
  defaultValue?: number,
): TableColumnOptions {
  return {
    name,
    type: 'tinyint',
    ...(defaultValue === undefined ? { isNullable: true } : { default: defaultValue }),
    comment,
  };
}

/** 比率列：实体声明 decimal(6, 4)，可空。 */
function rateColumn(name: string, comment: string): TableColumnOptions {
  return { name, type: 'decimal', precision: 6, scale: 4, isNullable: true, comment };
}

/** 业务时间列：可空 datetime（实体未给 precision，默认 0 位小数秒）。 */
function nullableTimeColumn(name: string, comment: string): TableColumnOptions {
  return { name, type: 'datetime', isNullable: true, comment };
}

function index(
  name: string,
  columnNames: string[],
  isUnique = false,
): TableIndexOptions {
  return { name, columnNames, isUnique };
}

/**
 * 渠道级配置：平台侧维护，每渠道一行，列按语义命名而非按渠道命名，
 * 新增渠道时加行不加列。
 */
function paymentChannelConfigTable(): Table {
  return new Table({
    name: 'payment_channel_config',
    engine: TABLE_ENGINE,
    comment: '支付渠道配置',
    columns: [
      ...baseColumns(),
      varchar('channel', 16, '渠道 wechat|alipay|mock'),
      booleanColumn('enabled', '平台侧渠道总开关', 0),
      varchar('notify_url', 255, '异步通知地址', nullable()),
      varchar('app_id', 64, 'AppID', nullable()),
      varchar('mch_id', 32, '微信服务商商户号', nullable()),
      varchar('serial_no', 64, '商户证书序列号', nullable()),
      booleanColumn('sandbox', '支付宝沙箱开关'),
      textColumn('api_key_encrypted', 'APIv3 密钥（密文）'),
      textColumn('private_key_encrypted', '商户/应用私钥（密文）'),
      varchar('public_key_id', 64, '平台公钥 ID', nullable()),
      textColumn('public_key_encrypted', '平台/支付宝公钥（密文）'),
      integer('updated_by_id', '最后修改人 ID', nullable()),
      varchar('updated_by_name', 64, '最后修改人姓名', nullable()),
    ],
    indices: [index('idx_payment_channel_config_channel', ['channel'], true)],
  });
}

/** 商户支付进件与开通配置：每商户每渠道一行。 */
function merchantPaymentConfigTable(): Table {
  return new Table({
    name: 'merchant_payment_config',
    engine: TABLE_ENGINE,
    comment: '商户支付进件与开通配置',
    columns: [
      ...tenantColumns(),
      varchar('channel', 16, '渠道 wechat|alipay|mock'),
      varchar('status', 20, '状态 pending_audit|enabled|rejected|disabled', {
        default: literal('pending_audit'),
      }),
      varchar('channel_account', 32, '特约商户号 sub_mchid / 支付宝 partner id', nullable()),
      rateColumn('fee_rate', '渠道费率'),
      rateColumn('profit_share_rate', '平台抽佣比例'),
      varchar('settle_account_name', 64, '结算户名', nullable()),
      textColumn('settle_account_no_encrypted', '结算账号（密文）'),
      varchar('license_no', 32, '营业执照号', nullable()),
      varchar('contact_name', 64, '联系人', nullable()),
      varchar('contact_phone', 20, '联系电话', nullable()),
      nullableTimeColumn('applied_at', '提交时间'),
      integer('applied_by_id', '提交人（商户员工）ID', nullable()),
      varchar('applied_by_name', 64, '提交人姓名快照', nullable()),
      nullableTimeColumn('audited_at', '审核时间'),
      integer('audited_by_id', '审核人（平台账号）ID', nullable()),
      varchar('audited_by_name', 64, '审核人姓名快照', nullable()),
      varchar('audit_remark', 255, '审核意见 / 驳回原因', nullable()),
    ],
    indices: [
      index('idx_merchant_payment_config_merchant_id', ['merchant_id']),
      index('idx_merchant_payment_config_status_created_at', ['status', 'created_at']),
      index('idx_merchant_payment_config_merchant_id_channel', ['merchant_id', 'channel'], true),
    ],
  });
}

/**
 * 关于外键：本迁移一条都不建，这是有意为之，与实体保持一致优先。
 * - 两个实体的 merchantId 都是基类上的普通 int 列，没有 @ManyToOne / @JoinColumn；
 *   payment_channel_config 更是平台侧表，连租户键列都没有。
 * - 与 AddPaymentDomain 实测过的结论相同：库里多出来的、实体 metadata 推不出的
 *   约束会被 schema:log 判为多余并要求删除，因为 TypeORM 只认关系装饰器推导的约束。
 * 归属关系因此由 PaymentConfigService 在应用层保证，与现有订单/支付表的做法一致。
 */

export class AddPaymentConfig1791100000000 implements MigrationInterface {
  name = 'AddPaymentConfig1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(paymentChannelConfigTable());
    await queryRunner.createTable(merchantPaymentConfigTable());
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 逆序回滚：后建的先回收
    await queryRunner.dropTable('merchant_payment_config', true);
    await queryRunner.dropTable('payment_channel_config', true);
  }
}
