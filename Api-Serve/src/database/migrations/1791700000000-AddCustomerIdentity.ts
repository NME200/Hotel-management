import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
  type TableColumnOptions,
  type TableIndexOptions,
} from 'typeorm';

/**
 * 把「登录身份」从「商户会员档案」里拆出来。
 *
 * 改造前 member 一张表同时承担两件事：微信身份（openid/昵称/手机号）+ 这家店的会员数据，
 * 唯一索引是 (merchant_id, openid)，于是同一个微信号在两家店是两个人，
 * 令牌又带着 merchantId，顾客一切店就被守卫判成「门店与登录门店不一致」，登录态当场作废。
 *
 * 改造后：
 * - `customer` 存身份，openid 全局唯一，一张表没有 merchant_id（它不属于任何一家店）；
 * - `member` 只留这家店自己的经营数据（等级/成长值/积分/储值余额/券/累计消费），
 *   加 customer_id 指回身份；余额与券继续按店独立，那是商户欠顾客的真实负债。
 *
 * 建表/建索引/改列全部走 SchemaBuilder，文件里不出现 DDL 文本。
 * 唯一例外是身份归并的一次性数据搬运：TypeORM 0.3 的 QueryRunner 只有 schema 级 API，
 * 而迁移要读的正是「改造前的 member 列」，仓库层已经按新实体的元数据把身份列过滤掉了，
 * 读不出来。这里只能用参数化 query() 逐行读写，不拼接任何输入，也不含业务 SQL。
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

function customerTable(): Table {
  return new Table({
    name: 'customer',
    engine: TABLE_ENGINE,
    comment: '小程序顾客（跨商户登录身份）',
    columns: [
      idColumn(),
      ...timestampColumns(),
      varchar('openid', 64, '微信 openid，全局唯一', nullable()),
      varchar('unionid', 64, '微信 unionid', nullable()),
      varchar('nickname', 64, '昵称'),
      varchar('avatar', 255, '头像', nullable()),
      varchar('phone', 20, '手机号，顾客授权或结算时补', nullable()),
      varchar('gender', 8, '性别', { default: literal('unknown') }),
      varchar('status', 16, '状态 active|disabled', { default: literal('active') }),
      varchar('register_source', 16, '注册来源', { default: literal('mini_program') }),
    ],
    indices: [
      index('idx_customer_openid', ['openid'], true),
      index('idx_customer_phone', ['phone']),
    ],
  });
}

/** 迁移期需要的旧列形状：member 拆身份列之前长这样。 */
type LegacyMemberRow = {
  id: number;
  openid: string | null;
  unionid: string | null;
  nickname: string | null;
  avatar: string | null;
  phone: string | null;
  gender: string | null;
  status: string | null;
  registerSource: string | null;
};

const IDENTITY_COLUMNS = ['nickname', 'avatar', 'phone', 'openid', 'unionid', 'gender'];

export class AddCustomerIdentity1791700000000 implements MigrationInterface {
  name = 'AddCustomerIdentity1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(customerTable());

    // 先以可空列落库：回填完成后才收紧成 NOT NULL，避免中途把存量行卡住
    await queryRunner.addColumns(
      'member',
      [integer('customer_id', '所属顾客 ID', nullable())].map((options) => new TableColumn(options)),
    );

    await this.backfill(queryRunner);

    await queryRunner.changeColumn(
      'member',
      new TableColumn(integer('customer_id', '所属顾客 ID', nullable())),
      new TableColumn(integer('customer_id', '所属顾客 ID')),
    );
    await queryRunner.createIndex(
      'member',
      new TableIndex(index('idx_member_merchant_id_customer_id', ['merchant_id', 'customer_id'], true)),
    );
    await queryRunner.createIndex(
      'member',
      new TableIndex(index('idx_member_customer_id', ['customer_id'])),
    );
    await queryRunner.createForeignKey(
      'member',
      new TableForeignKey({
        name: 'fk_member_customer_id',
        columnNames: ['customer_id'],
        referencedTableName: 'customer',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.dropIndex('member', 'idx_member_merchant_id_phone');
    await queryRunner.dropIndex('member', 'idx_member_merchant_id_openid');
    await queryRunner.dropColumns('member', IDENTITY_COLUMNS);
    // 表的职责变了，注释跟着改：member 不再是「一个微信用户」，而是「某顾客在某店的档案」
    await queryRunner.changeTableComment(
      'member',
      '商户会员档案：某个顾客在某一家店里的会员身份',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns(
      'member',
      [
        varchar('nickname', 64, '昵称', { default: literal('') }),
        varchar('avatar', 255, '头像', nullable()),
        varchar('phone', 20, '手机号', nullable()),
        varchar('openid', 64, '微信 openid', nullable()),
        varchar('unionid', 64, '微信 unionid', nullable()),
        varchar('gender', 8, '性别', { default: literal('unknown') }),
      ].map((options) => new TableColumn(options)),
    );

    await this.restoreIdentityColumns(queryRunner);

    // 先删外键再删索引：MySQL 不允许删掉外键正在使用的索引，
    // 反过来写会卡在 dropIndex（DDL 在 MySQL 里不回滚，半个 down 跑完比没跑更难收拾）。
    await queryRunner.dropForeignKey('member', 'fk_member_customer_id');
    await queryRunner.dropIndex('member', 'idx_member_customer_id');
    await queryRunner.dropIndex('member', 'idx_member_merchant_id_customer_id');
    await queryRunner.dropColumn('member', 'customer_id');
    await queryRunner.createIndex(
      'member',
      new TableIndex(index('idx_member_merchant_id_phone', ['merchant_id', 'phone'], true)),
    );
    await queryRunner.createIndex(
      'member',
      new TableIndex(index('idx_member_merchant_id_openid', ['merchant_id', 'openid'], true)),
    );
    await queryRunner.changeTableComment(
      'member',
      '商户会员，小程序下单后自动建档',
    );
    await queryRunner.dropTable('customer', true);
  }

  /**
   * 按 openid 归并出顾客，再把每家店的会员档案指过去。
   *
   * 同一 openid 的多条 member 只对应一个顾客，取 id 最小那条的身份信息
   * （最早建档的那条最接近顾客自己填的昵称）；没有 openid 的历史会员
   * 每人各分一个顾客，否则会被错误地并成同一个人。
   */
  private async backfill(queryRunner: QueryRunner): Promise<void> {
    const rows: LegacyMemberRow[] = await queryRunner.query(
      `SELECT id, openid, unionid, nickname, avatar, phone, gender, status, register_source AS registerSource
         FROM member ORDER BY id`,
    );

    const byOpenid = new Map<string, number>();
    for (const row of rows) {
      const key = row.openid?.trim() ?? '';
      let customerId = key ? byOpenid.get(key) : undefined;

      if (customerId === undefined) {
        const inserted = await queryRunner.query(
          `INSERT INTO customer (openid, unionid, nickname, avatar, phone, gender, status, register_source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            key || null,
            row.unionid ?? null,
            row.nickname ?? '',
            row.avatar ?? null,
            row.phone ?? null,
            row.gender ?? 'unknown',
            row.status ?? 'active',
            row.registerSource ?? 'mini_program',
          ],
        );
        customerId = Number(inserted.insertId);
        if (key) {
          byOpenid.set(key, customerId);
        }
      }

      await queryRunner.query('UPDATE member SET customer_id = ? WHERE id = ?', [
        customerId,
        row.id,
      ]);
    }
  }

  /** 回滚时用：把顾客身份写回会员档案，恢复改造前的一张表。 */
  private async restoreIdentityColumns(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE member m JOIN customer c ON c.id = m.customer_id
          SET m.nickname = c.nickname, m.avatar = c.avatar, m.phone = c.phone,
              m.openid = c.openid, m.unionid = c.unionid, m.gender = c.gender`,
    );
  }
}
