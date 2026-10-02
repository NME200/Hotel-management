import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  type TableColumnOptions,
  type TableForeignKeyOptions,
  type TableIndexOptions,
} from 'typeorm';

/**
 * 初始化全部 11 张业务表。
 *
 * 遵循 DESIGN.md「后端文件禁止出现 SQL」的硬性规则：这里只用 TypeORM 的
 * SchemaBuilder 声明式描述表结构（Table / TableForeignKey），具体的建表方言
 * 由 MySQL 驱动根据实体与命名策略生成，本文件不书写任何语句文本。
 *
 * 结构与 src/database/entities 下的实体一一对应：
 * - 公共列 id / created_at / updated_at 见 BaseEntity；
 * - 租户键 merchant_id 见 TenantBaseEntity（同时带来普通索引 idx_<table>_merchant_id）；
 * - 列名保持 snake_case，索引与外键名沿用 SnakeNamingStrategy 的推导结果。
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

function merchantIdColumn(): TableColumnOptions {
  return {
    name: 'merchant_id',
    type: 'int',
    comment: '所属商户 ID（租户键）',
  };
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

function nullable(): Partial<TableColumnOptions> {
  return { isNullable: true };
}

function integer(
  name: string,
  comment: string,
  options: Partial<TableColumnOptions> = {},
): TableColumnOptions {
  return { name, type: 'int', comment, ...options };
}

function money(
  name: string,
  comment: string,
  options: Partial<TableColumnOptions> = {},
): TableColumnOptions {
  return { name, type: 'decimal', precision: 10, scale: 2, comment, ...options };
}

function geo(name: string, comment: string): TableColumnOptions {
  return { name, type: 'decimal', precision: 10, scale: 7, isNullable: true, comment };
}

function textColumn(
  name: string,
  comment: string,
  options: Partial<TableColumnOptions> = {},
): TableColumnOptions {
  return { name, type: 'text', comment, ...options };
}

/** 布尔列在 MySQL 落为 tinyint，false -> 0。 */
function booleanColumn(
  name: string,
  comment: string,
): TableColumnOptions {
  return { name, type: 'tinyint', default: 0, comment };
}

/** 业务时间列：可空 datetime。 */
function timeColumn(name: string, comment: string): TableColumnOptions {
  return { name, type: 'datetime', isNullable: true, comment };
}

function index(
  name: string,
  columnNames: string[],
  isUnique = false,
): TableIndexOptions {
  return { name, columnNames, isUnique };
}

/** 商户：平台侧的 SaaS 租户主体，不带租户键自身。 */
function merchantTable(): Table {
  return new Table({
    name: 'merchant',
    engine: TABLE_ENGINE,
    columns: [
      ...baseColumns(),
      varchar('code', 32, '商户编号，登录时使用'),
      varchar('name', 128, '商户名称'),
      varchar('contact_name', 64, '联系人'),
      varchar('contact_phone', 20, '联系电话'),
      varchar('logo', 255, 'Logo 地址', nullable()),
      varchar('status', 16, '商户状态', { default: literal('pending_audit') }),
      timeColumn('expire_at', '服务到期时间'),
      varchar('remark', 255, '备注', nullable()),
      timeColumn('audited_at', '审核通过时间'),
      varchar('audit_remark', 255, '审核意见', nullable()),
    ],
    indices: [
      index('idx_merchant_code', ['code'], true),
      index('idx_merchant_status', ['status']),
    ],
  });
}

/** 平台运营账号。 */
function platformUserTable(): Table {
  return new Table({
    name: 'platform_user',
    engine: TABLE_ENGINE,
    columns: [
      ...baseColumns(),
      varchar('username', 64, '登录账号'),
      varchar('password_hash', 128, '密码散列（scrypt）'),
      varchar('real_name', 64, '姓名'),
      varchar('phone', 20, '联系电话', nullable()),
      varchar('role', 32, '平台角色'),
      varchar('status', 16, '账号状态', { default: literal('active') }),
    ],
    indices: [index('idx_platform_user_username', ['username'], true)],
  });
}

/** 商户员工账号。 */
function merchantStaffTable(): Table {
  return new Table({
    name: 'merchant_staff',
    engine: TABLE_ENGINE,
    comment: '商户员工账号，登录名在商户内唯一',
    columns: [
      ...tenantColumns(),
      varchar('username', 64, '登录账号'),
      varchar('password_hash', 128, '密码散列（scrypt）'),
      varchar('real_name', 64, '姓名'),
      varchar('phone', 20, '手机号', nullable()),
      varchar('role', 16, '角色'),
      varchar('status', 16, '账号状态', { default: literal('active') }),
      timeColumn('last_login_at', '最近登录时间'),
    ],
    indices: [
      index('idx_merchant_staff_merchant_id', ['merchant_id']),
      index('idx_merchant_staff_merchant_id_status', ['merchant_id', 'status']),
      index('idx_merchant_staff_merchant_id_username', ['merchant_id', 'username'], true),
    ],
  });
}

/** 菜品分类。 */
function dishCategoryTable(): Table {
  return new Table({
    name: 'dish_category',
    engine: TABLE_ENGINE,
    comment: '菜品分类',
    columns: [
      ...tenantColumns(),
      varchar('name', 64, '分类名称'),
      integer('sort', '排序值，越小越靠前', { default: literal('0') }),
      varchar('status', 16, '状态', { default: literal('enabled') }),
      varchar('image', 255, '分类图标', nullable()),
    ],
    indices: [
      index('idx_dish_category_merchant_id', ['merchant_id']),
      index('idx_dish_category_merchant_id_sort', ['merchant_id', 'sort']),
      index('idx_dish_category_merchant_id_name', ['merchant_id', 'name'], true),
    ],
  });
}

/** 菜品。 */
function dishTable(): Table {
  return new Table({
    name: 'dish',
    engine: TABLE_ENGINE,
    comment: '菜品',
    columns: [
      ...tenantColumns(),
      integer('category_id', '所属分类 ID'),
      varchar('name', 64, '菜品名称'),
      varchar('subtitle', 128, '副标题', nullable()),
      varchar('image', 255, '主图', nullable()),
      textColumn('description', '菜品描述', nullable()),
      money('price', '售价'),
      money('member_price', '会员价', nullable()),
      varchar('unit', 16, '计量单位', { default: literal('份') }),
      varchar('stock_type', 16, '库存模式', { default: literal('unlimited') }),
      integer('stock', '剩余库存，unlimited 时为 null', nullable()),
      integer('sales_count', '累计销量', { default: literal('0') }),
      integer('sort', '排序值', { default: literal('0') }),
      booleanColumn('is_recommend', '是否招牌推荐'),
      textColumn('tags', '标签列表'),
      varchar('status', 16, '上下架状态', { default: literal('on_sale') }),
    ],
    indices: [
      index('idx_dish_merchant_id', ['merchant_id']),
      index('idx_dish_merchant_id_category_id_sort', ['merchant_id', 'category_id', 'sort']),
      index('idx_dish_merchant_id_status', ['merchant_id', 'status']),
    ],
  });
}

/** 菜品加料/口味分组。 */
function dishOptionGroupTable(): Table {
  return new Table({
    name: 'dish_option_group',
    engine: TABLE_ENGINE,
    comment: '菜品加料/口味分组',
    columns: [
      ...tenantColumns(),
      integer('dish_id', '所属菜品 ID'),
      varchar('name', 64, '分组名称，如 辣度'),
      varchar('type', 16, '单选 single / 多选 multi'),
      booleanColumn('required', '是否必选'),
      integer('sort', '排序值', { default: literal('0') }),
      textColumn('options', '可选项列表 [{name,priceDelta,sort}]'),
    ],
    indices: [
      index('idx_dish_option_group_merchant_id', ['merchant_id']),
      index('idx_dish_option_group_merchant_id_dish_id_sort', ['merchant_id', 'dish_id', 'sort']),
    ],
  });
}

/** 菜品规格。 */
function dishSkuTable(): Table {
  return new Table({
    name: 'dish_sku',
    engine: TABLE_ENGINE,
    comment: '菜品规格',
    columns: [
      ...tenantColumns(),
      integer('dish_id', '所属菜品 ID'),
      varchar('name', 64, '规格名称，如 小份/大份'),
      money('price', '规格售价'),
      varchar('spec_desc', 128, '规格描述', nullable()),
      integer('stock', '规格库存', nullable()),
      integer('sort', '排序值', { default: literal('0') }),
    ],
    indices: [
      index('idx_dish_sku_merchant_id', ['merchant_id']),
      index('idx_dish_sku_merchant_id_dish_id', ['merchant_id', 'dish_id']),
    ],
  });
}

/** 商户会员。 */
function memberTable(): Table {
  return new Table({
    name: 'member',
    engine: TABLE_ENGINE,
    comment: '商户会员，小程序下单后自动建档',
    columns: [
      ...tenantColumns(),
      varchar('nickname', 64, '昵称'),
      varchar('avatar', 255, '头像', nullable()),
      varchar('phone', 20, '手机号，商户内唯一'),
      varchar('gender', 8, '性别', { default: literal('unknown') }),
      varchar('level', 16, '等级', { default: literal('normal') }),
      integer('points', '积分', { default: literal('0') }),
      money('balance', '储值余额', { default: literal('0.00') }),
      money('total_amount', '累计消费金额', { default: literal('0.00') }),
      integer('order_count', '累计订单数', { default: literal('0') }),
      varchar('remark', 255, '商家备注', nullable()),
      varchar('status', 16, '状态', { default: literal('active') }),
      varchar('register_source', 16, '注册来源', { default: literal('mini_program') }),
      timeColumn('last_order_at', '最近下单时间'),
    ],
    indices: [
      index('idx_member_merchant_id', ['merchant_id']),
      index('idx_member_merchant_id_level', ['merchant_id', 'level']),
      index('idx_member_merchant_id_phone', ['merchant_id', 'phone'], true),
    ],
  });
}

/** 点餐订单。 */
function orderInfoTable(): Table {
  return new Table({
    name: 'order_info',
    engine: TABLE_ENGINE,
    comment: '点餐订单',
    columns: [
      ...tenantColumns(),
      varchar('order_no', 32, '订单号，全局唯一'),
      varchar('pickup_code', 8, '取餐码', nullable()),
      integer('member_id', '下单会员 ID', nullable()),
      varchar('member_nickname', 64, '下单时会员昵称快照', nullable()),
      varchar('dine_type', 16, '就餐方式'),
      varchar('status', 16, '订单状态', { default: literal('pending') }),
      varchar('table_no', 32, '桌号', nullable()),
      integer('people_count', '就餐人数', { default: literal('1') }),
      money('dish_amount', '菜品金额', { default: literal('0.00') }),
      money('packing_amount', '打包费', { default: literal('0.00') }),
      money('delivery_amount', '配送费', { default: literal('0.00') }),
      money('discount_amount', '优惠金额', { default: literal('0.00') }),
      money('pay_amount', '实付金额', { default: literal('0.00') }),
      varchar('remark', 255, '顾客备注', nullable()),
      varchar('handle_remark', 255, '商家处理备注', nullable()),
      timeColumn('accepted_at', '接单时间'),
      timeColumn('ready_at', '出餐时间'),
      timeColumn('completed_at', '完成时间'),
      timeColumn('cancelled_at', '取消时间'),
      varchar('cancel_reason', 255, '取消原因', nullable()),
    ],
    indices: [
      index('idx_order_info_merchant_id', ['merchant_id']),
      index('idx_order_info_status', ['status']),
      index('idx_order_info_order_no', ['order_no'], true),
      index('idx_order_info_merchant_id_created_at', ['merchant_id', 'created_at']),
      index('idx_order_info_merchant_id_status_created_at', ['merchant_id', 'status', 'created_at']),
    ],
  });
}

/** 订单明细。 */
function orderItemTable(): Table {
  return new Table({
    name: 'order_item',
    engine: TABLE_ENGINE,
    comment: '订单明细，菜品信息以快照存储',
    columns: [
      ...tenantColumns(),
      integer('order_id', '所属订单 ID'),
      integer('dish_id', '菜品 ID', nullable()),
      varchar('dish_name', 64, '菜品名称快照'),
      varchar('dish_image', 255, '菜品图片快照', nullable()),
      integer('sku_id', '规格 ID', nullable()),
      varchar('spec_desc', 128, '规格与加料描述', nullable()),
      money('unit_price', '单价'),
      integer('quantity', '数量'),
      money('total_amount', '小计金额'),
      varchar('remark', 255, '明细备注', nullable()),
    ],
    indices: [
      index('idx_order_item_merchant_id', ['merchant_id']),
      index('idx_order_item_merchant_id_order_id', ['merchant_id', 'order_id']),
    ],
  });
}

/** 门店：一个商户一个营业门店，故 merchant_id 上另有唯一索引。 */
function storeTable(): Table {
  return new Table({
    name: 'store',
    engine: TABLE_ENGINE,
    comment: '门店基础信息，一个商户一个营业门店',
    columns: [
      ...tenantColumns(),
      varchar('name', 128, '门店名称'),
      varchar('logo', 255, '门头照', nullable()),
      varchar('province', 32, '省', nullable()),
      varchar('city', 32, '市', nullable()),
      varchar('district', 32, '区/县', nullable()),
      varchar('address', 255, '详细地址', nullable()),
      geo('longitude', '经度'),
      geo('latitude', '纬度'),
      varchar('phone', 20, '客服电话', nullable()),
      varchar('notice', 255, '门店公告', nullable()),
      textColumn('business_hours', '营业时间段，如 ["10:00-14:00","17:00-21:00"]'),
      varchar('status', 16, '营业状态', { default: literal('closed') }),
    ],
    indices: [
      index('idx_store_merchant_id', ['merchant_id']),
      index('uk_store_merchant_id', ['merchant_id'], true),
    ],
  });
}

/** 建表顺序：被引用表先建，回滚时逆序。 */
function tables(): Table[] {
  return [
    merchantTable(),
    platformUserTable(),
    merchantStaffTable(),
    dishCategoryTable(),
    dishTable(),
    dishOptionGroupTable(),
    dishSkuTable(),
    memberTable(),
    orderInfoTable(),
    orderItemTable(),
    storeTable(),
  ];
}

interface ForeignKeyBinding {
  readonly tableName: string;
  readonly foreignKey: TableForeignKey;
}

function foreignKeyBinding(
  tableName: string,
  options: TableForeignKeyOptions,
): ForeignKeyBinding {
  return { tableName, foreignKey: new TableForeignKey(options) };
}

/** 5 条外键关系，与实体上的 ManyToOne onDelete 一致。 */
function foreignKeys(): ForeignKeyBinding[] {
  return [
    foreignKeyBinding('dish_option_group', {
      name: 'fk_dish_option_group_dish_id',
      columnNames: ['dish_id'],
      referencedTableName: 'dish',
      referencedColumnNames: ['id'],
      onDelete: 'CASCADE',
      onUpdate: 'NO ACTION',
    }),
    foreignKeyBinding('dish_sku', {
      name: 'fk_dish_sku_dish_id',
      columnNames: ['dish_id'],
      referencedTableName: 'dish',
      referencedColumnNames: ['id'],
      onDelete: 'CASCADE',
      onUpdate: 'NO ACTION',
    }),
    foreignKeyBinding('dish', {
      name: 'fk_dish_category_id',
      columnNames: ['category_id'],
      referencedTableName: 'dish_category',
      referencedColumnNames: ['id'],
      onDelete: 'RESTRICT',
      onUpdate: 'NO ACTION',
    }),
    foreignKeyBinding('order_item', {
      name: 'fk_order_item_order_id',
      columnNames: ['order_id'],
      referencedTableName: 'order_info',
      referencedColumnNames: ['id'],
      onDelete: 'CASCADE',
      onUpdate: 'NO ACTION',
    }),
    foreignKeyBinding('order_info', {
      name: 'fk_order_info_member_id',
      columnNames: ['member_id'],
      referencedTableName: 'member',
      referencedColumnNames: ['id'],
      onDelete: 'SET NULL',
      onUpdate: 'NO ACTION',
    }),
  ];
}

export class InitSchema1790849056795 implements MigrationInterface {
  name = 'InitSchema1790849056795';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of tables()) {
      await queryRunner.createTable(table);
    }
    for (const binding of foreignKeys()) {
      await queryRunner.createForeignKey(binding.tableName, binding.foreignKey);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const bindings = foreignKeys();
    for (let i = bindings.length - 1; i >= 0; i -= 1) {
      await queryRunner.dropForeignKey(bindings[i].tableName, bindings[i].foreignKey);
    }
    const created = tables();
    for (let i = created.length - 1; i >= 0; i -= 1) {
      await queryRunner.dropTable(created[i], true);
    }
  }
}
