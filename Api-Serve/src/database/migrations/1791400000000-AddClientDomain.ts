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
 * 顾客侧（小程序）数据域：
 *
 * 1. `mini_program_config` —— 平台保管的小程序 AppID/AppSecret，secret 存密文；
 * 2. `coupon_template` / `member_coupon` —— 券模板与会员持券，会员持券带完整快照，
 *    商户改模板不会追溯影响已发出的券；
 * 3. `member` 加 openid / unionid / growth_value，并把 phone 放开为可空
 *    （微信授权登录只给 openid，手机号留到结算时补），
 *    同时补 (merchant_id, openid) 唯一索引——同一微信用户在每个商户各一条会员记录。
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

function tenantColumns(): TableColumnOptions[] {
  return [
    idColumn(),
    ...timestampColumns(),
    { name: 'merchant_id', type: 'int', comment: '所属商户 ID（租户键）' },
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

/** 实体里声明为 simple-json 的列在 MySQL 下落成 text，与 InitSchema 的写法保持一致。 */
function text(name: string, comment: string, options: Partial<TableColumnOptions> = {}): TableColumnOptions {
  return { name, type: 'text', comment, ...options };
}

function ratio(name: string, comment: string): TableColumnOptions {
  return { name, type: 'decimal', precision: 5, scale: 4, isNullable: true, comment };
}

function timeColumn(name: string, comment: string): TableColumnOptions {
  return { name, type: 'datetime', isNullable: true, comment };
}

function notNullTime(name: string, comment: string): TableColumnOptions {
  return { name, type: 'datetime', comment };
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

function miniProgramConfigTable(): Table {
  return new Table({
    name: 'mini_program_config',
    engine: TABLE_ENGINE,
    comment: '顾客小程序配置（全局单行）',
    columns: [
      ...baseColumnsWithoutTenant(),
      varchar('slot', 16, '配置槽位，全局只有一行', { default: literal('global') }),
      { name: 'login_enabled', type: 'boolean', default: true, comment: '小程序登录开关' },
      varchar('app_id', 64, '小程序 AppID', nullable()),
      text('app_secret_encrypted', '小程序 AppSecret（密文）', nullable()),
      integer('updated_by_id', '最后修改人 ID', nullable()),
      varchar('updated_by_name', 64, '最后修改人姓名', nullable()),
    ],
    indices: [
      index('idx_mini_program_config_slot', ['slot'], true),
      index('idx_mini_program_config_id', ['id']),
    ],
  });
}

function baseColumnsWithoutTenant(): TableColumnOptions[] {
  return [idColumn(), ...timestampColumns()];
}

function couponTemplateTable(): Table {
  return new Table({
    name: 'coupon_template',
    engine: TABLE_ENGINE,
    comment: '优惠券模板',
    columns: [
      ...tenantColumns(),
      varchar('name', 64, '券名称'),
      varchar('type', 16, '券类型 reduction|discount', { default: literal('reduction') }),
      integer('amount_cents', '满减面额（分），折扣券为 0', { default: 0 }),
      ratio('discount_ratio', '折扣券实付比例，如 0.8800 表示 8.8 折'),
      integer('max_discount_cents', '折扣券最高优惠（分）', nullable()),
      integer('threshold_cents', '使用门槛（分），0 表示无门槛', { default: 0 }),
      varchar('validity_type', 16, '有效期模式 fixed|relative', { default: literal('fixed') }),
      timeColumn('valid_from', 'fixed 模式：生效时间'),
      timeColumn('valid_to', 'fixed 模式：失效时间'),
      integer('valid_days', 'relative 模式：领取后 N 天内有效', nullable()),
      integer('total_count', '发放总量，-1 不限', { default: -1 }),
      integer('issued_count', '已发放数量', { default: 0 }),
      integer('per_member_limit', '每人限领张数', { default: 1 }),
      { name: 'claimable', type: 'boolean', default: true, comment: '是否出现在领券中心' },
      varchar('redeem_code', 16, '兑换码，商户内唯一', nullable()),
      varchar('scope_type', 16, '适用范围 all|category|dish', { default: literal('all') }),
      text('scope_ids', 'scope_type 非 all 时的 ID 列表', nullable()),
      varchar('description', 255, '使用说明', nullable()),
      varchar('status', 16, '模板状态 enabled|disabled', { default: literal('enabled') }),
      integer('sort', '排序值', { default: 0 }),
    ],
    indices: [
      index('idx_coupon_template_merchant_id', ['merchant_id']),
      index('idx_coupon_template_merchant_id_status', ['merchant_id', 'status']),
      index('idx_coupon_template_merchant_id_claimable_status', ['merchant_id', 'claimable', 'status']),
      index('idx_coupon_template_merchant_id_redeem_code', ['merchant_id', 'redeem_code'], true),
    ],
  });
}

function memberCouponTable(): Table {
  return new Table({
    name: 'member_coupon',
    engine: TABLE_ENGINE,
    comment: '会员优惠券',
    columns: [
      ...tenantColumns(),
      varchar('coupon_no', 32, '券号，全局唯一'),
      integer('template_id', '来源模板 ID'),
      integer('member_id', '所属会员 ID'),
      varchar('name', 64, '券名称快照'),
      varchar('type', 16, '券类型快照 reduction|discount'),
      integer('amount_cents', '满减面额快照（分）', { default: 0 }),
      ratio('discount_ratio', '折扣比例快照'),
      integer('max_discount_cents', '最高优惠快照（分）', nullable()),
      integer('threshold_cents', '使用门槛快照（分）', { default: 0 }),
      varchar('scope_type', 16, '适用范围快照'),
      text('scope_ids', '适用范围 ID 列表快照', nullable()),
      varchar('description', 255, '使用说明快照', nullable()),
      notNullTime('valid_from', '生效时间'),
      notNullTime('valid_to', '失效时间'),
      varchar('status', 16, '状态 unused|used|expired', { default: literal('unused') }),
      varchar('source', 16, '来源 claim|merchant_send|redeem_code'),
      integer('order_id', '核销订单 ID', nullable()),
      timeColumn('used_at', '核销时间'),
    ],
    indices: [
      index('idx_member_coupon_coupon_no', ['coupon_no'], true),
      index('idx_member_coupon_merchant_id', ['merchant_id']),
      index('idx_member_coupon_merchant_id_member_id_status', ['merchant_id', 'member_id', 'status']),
      index('idx_member_coupon_merchant_id_template_id', ['merchant_id', 'template_id']),
    ],
  });
}

/** member.phone 原定义：InitSchema 里是不带 nullable 的 varchar(20)。 */
function memberPhoneBefore(): TableColumn {
  return new TableColumn({
    name: 'phone',
    type: 'varchar',
    length: '20',
    comment: '手机号，商户内唯一',
  });
}

function memberPhoneAfter(): TableColumn {
  return new TableColumn({
    name: 'phone',
    type: 'varchar',
    length: '20',
    isNullable: true,
    comment: '手机号，商户内唯一；微信授权登录时可后补',
  });
}

export class AddClientDomain1791400000000 implements MigrationInterface {
  name = 'AddClientDomain1791400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(miniProgramConfigTable());
    await queryRunner.createTable(couponTemplateTable());
    await queryRunner.createTable(memberCouponTable());

    await queryRunner.addColumns(
      'member',
      [
        varchar('openid', 64, '微信 openid', nullable()),
        varchar('unionid', 64, '微信 unionid', nullable()),
        integer('growth_value', '成长值，只由消费与任务累加', { default: 0 }),
      ].map((options) => new TableColumn(options)),
    );
    await queryRunner.createIndex(
      'member',
      new TableIndex(index('idx_member_merchant_id_openid', ['merchant_id', 'openid'], true)),
    );
    // 授权登录只给 openid，手机号得允许后补；MySQL 唯一索引不拦 NULL，多条空手机号可共存
    await queryRunner.changeColumn('member', memberPhoneBefore(), memberPhoneAfter());
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.changeColumn('member', memberPhoneAfter(), memberPhoneBefore());
    await queryRunner.dropIndex('member', 'idx_member_merchant_id_openid');
    await queryRunner.dropColumns('member', ['openid', 'unionid', 'growth_value']);
    await queryRunner.dropTable('member_coupon', true);
    await queryRunner.dropTable('coupon_template', true);
    await queryRunner.dropTable('mini_program_config', true);
  }
}
