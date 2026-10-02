import {
  In,
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
  type TableColumnOptions,
  type TableIndexOptions,
} from 'typeorm';
import { OrderStatus, PayStatus } from '../../common/constants/dict';
import { Order } from '../entities/order.entity';
import { PaymentStatus, RefundStatus } from '../../modules/payment/constants/payment.constant';

/**
 * 新增支付域：payment / payment_refund / payment_notify_log 三张表，
 * 并给 order_info 补上 pay_status 列（实体早已声明，此前没有落库）。
 *
 * 与 InitSchema、AddPlatformAudit 一致：这里只用 TypeORM 的 SchemaBuilder
 * 声明式 API（new Table / createTable / addColumn / createIndex），
 * 具体的建表方言由 MySQL 驱动根据实体与 SnakeNamingStrategy 生成，
 * 本文件不出现任何 SQL 语句文本（DESIGN.md 硬性要求）。
 * 回填历史数据同样走 EntityManager API（queryRunner.manager.update）。
 *
 * 结构与实体一一对应：
 * - payment / payment_refund 继承 TenantBaseEntity，公共列 + merchant_id；
 * - payment_notify_log 继承 BaseEntity（不是租户表），merchant_id 是实体里
 *   显式声明的可空列，不能与基类的租户键列混用，故本文件单独走 baseColumns()；
 * - 列名 snake_case，索引名沿用命名策略推导出的 idx_ 前缀结果（唯一索引用
 *   idx_ 而非 uk_，与 InitSchema 里 @Index(..., {unique:true}) 的落库结果一致）；
 * - 不建外键，理由见下方 FK 说明。
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

/** 公共列（非租户表，见 PaymentNotifyLog）。 */
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

/** simple-json 列在 MySQL 落为 text，可空。 */
function jsonColumn(name: string, comment: string): TableColumnOptions {
  return { name, type: 'text', isNullable: true, comment };
}

/** 原文/大文本列，可空。 */
function textColumn(name: string, comment: string): TableColumnOptions {
  return { name, type: 'text', isNullable: true, comment };
}

/** 布尔列在 MySQL 落为 tinyint，false -> 0 / true -> 1。 */
function booleanColumn(
  name: string,
  comment: string,
  defaultValue: number,
): TableColumnOptions {
  return { name, type: 'tinyint', default: defaultValue, comment };
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

/** 支付单：一笔订单的一次收款尝试。 */
function paymentTable(): Table {
  return new Table({
    name: 'payment',
    engine: TABLE_ENGINE,
    comment: '支付单',
    columns: [
      ...tenantColumns(),
      varchar('payment_no', 32, '商户支付单号 out_trade_no'),
      integer('order_id', '订单 ID'),
      varchar('channel', 16, '支付渠道 wechat|alipay|mock'),
      varchar('channel_account', 32, '渠道侧收款账户：微信特约商户号 sub_mchid / 支付宝 PID', nullable()),
      varchar('trade_no', 64, '渠道交易号 transaction_id，回调落库后回填', nullable()),
      integer('amount_cents', '支付金额（分）'),
      varchar('status', 16, '支付状态', { default: literal(PaymentStatus.Created) }),
      booleanColumn('need_profit_sharing', '是否需要分账（服务商模式平台抽佣）', 0),
      integer('refunded_cents', '已退金额（分）', { default: literal('0') }),
      varchar('prepay_id', 64, '渠道预支付会话标识', nullable()),
      jsonColumn('pay_params', '客户端调起支付所需参数快照'),
      nullableTimeColumn('paid_at', '支付成功时间'),
      nullableTimeColumn('closed_at', '关单时间'),
      { name: 'expire_at', type: 'datetime', comment: '支付超时时间，超时后主动关单' },
      varchar('failure_reason', 255, '失败原因', nullable()),
    ],
    indices: [
      index('idx_payment_merchant_id', ['merchant_id']),
      index('idx_payment_merchant_id_order_id', ['merchant_id', 'order_id']),
      index('idx_payment_payment_no', ['payment_no'], true),
      index('idx_payment_trade_no', ['trade_no'], true),
      index('idx_payment_merchant_id_status_created_at', ['merchant_id', 'status', 'created_at']),
    ],
  });
}

/** 退款单：支持部分退款。 */
function paymentRefundTable(): Table {
  return new Table({
    name: 'payment_refund',
    engine: TABLE_ENGINE,
    comment: '退款单',
    columns: [
      ...tenantColumns(),
      varchar('refund_no', 32, '商户退款单号 out_refund_no'),
      integer('payment_id', '支付单 ID'),
      integer('order_id', '订单 ID'),
      varchar('channel', 16, '退款渠道，跟随原支付单'),
      varchar('channel_refund_id', 64, '渠道退款单号 refund_id', nullable()),
      integer('amount_cents', '退款金额（分）'),
      integer('total_amount_cents', '原支付单金额（分），对账时免二次查询'),
      varchar('status', 16, '退款状态', { default: literal(RefundStatus.Processing) }),
      varchar('reason', 255, '退款原因', nullable()),
      integer('operator_id', '操作人 ID（商家端员工）', nullable()),
      varchar('operator_name', 64, '操作人名称快照', nullable()),
      nullableTimeColumn('succeeded_at', '退款成功时间'),
      varchar('failure_reason', 255, '失败原因', nullable()),
    ],
    indices: [
      index('idx_payment_refund_merchant_id', ['merchant_id']),
      index('idx_payment_refund_merchant_id_order_id', ['merchant_id', 'order_id']),
      index('idx_payment_refund_channel_refund_id', ['channel_refund_id'], true),
      index('idx_payment_refund_refund_no', ['refund_no'], true),
      index('idx_payment_refund_merchant_id_status_created_at', [
        'merchant_id',
        'status',
        'created_at',
      ]),
    ],
  });
}

/**
 * 渠道异步通知原始记录。
 * 注意 merchant_id 可空且非租户键（实体继承 BaseEntity）。
 */
function paymentNotifyLogTable(): Table {
  return new Table({
    name: 'payment_notify_log',
    engine: TABLE_ENGINE,
    comment: '支付渠道通知原始记录',
    columns: [
      ...baseColumns(),
      varchar('channel', 16, '通知来源渠道'),
      integer('merchant_id', '归属商户，未识别到时为空', nullable()),
      varchar('notify_type', 16, '通知类型 payment|refund'),
      varchar('notify_id', 64, '渠道通知唯一 ID，去重用'),
      varchar('payment_no', 32, '商户支付单号', nullable()),
      varchar('refund_no', 32, '商户退款单号', nullable()),
      varchar('trade_no', 64, '渠道交易号', nullable()),
      integer('amount_cents', '通知里的金额（分），用于与本地核对', nullable()),
      jsonColumn('payload', '验签解密后的业务数据'),
      textColumn('raw_body', '原始请求体，排障用'),
      booleanColumn('verified', '验签是否通过', 1),
      booleanColumn('handled', '是否已被业务处理', 0),
      varchar('process_result', 255, '处理结果或失败原因', nullable()),
    ],
    indices: [
      index('idx_payment_notify_log_channel_notify_id', ['channel', 'notify_id'], true),
      index('idx_payment_notify_log_merchant_id_created_at', ['merchant_id', 'created_at']),
      index('idx_payment_notify_log_payment_no', ['payment_no']),
      index('idx_payment_notify_log_trade_no', ['trade_no']),
    ],
  });
}

/** order_info.pay_status：实体早已声明，这里补列 + 补索引。 */
function payStatusColumn(): TableColumnOptions {
  // 20 而非 16：partially_refunded 有 18 个字符
  return varchar('pay_status', 20, '支付状态，与出餐状态机独立', {
    default: literal(PayStatus.Unpaid),
  });
}

function payStatusIndex(): TableIndexOptions {
  return index('idx_order_info_pay_status', ['pay_status']);
}

/**
 * 关于外键：本迁移一条都不建，这是有意为之，与实体保持一致优先。
 * - Payment.orderId、PaymentRefund.paymentId、PaymentRefund.orderId 在实体上都是
 *   普通 int 列，没有 @ManyToOne / @JoinColumn；BaseEntity / TenantBaseEntity
 *   也没有任何关系装饰器。
 * - 实测：先按需求给 payment_refund.payment_id 加了指向 payment.id 的级联外键，
 *   schema:log 立刻要求把它删掉——TypeORM 的 dropOldForeignKeys 只认实体
 *   metadata 里由关系推导出来的外键，库里多出来的会被判为多余。
 * - InitSchema 也是同样的做法：那里 5 条外键全部对应实体上显式声明并带 onDelete
 *   的 ManyToOne。
 * 跨表完整性因此由 payment.service 在应用层保证，与现有订单/菜品表的做法一致。
 */

/**
 * 已完成的演示订单不能停留在 unpaid：出餐状态机与支付状态机是两条独立线，
 * 历史数据里没有支付单，但业务上这些单确实收过钱了。
 * 回填走 EntityManager 的更新 API，不落任何语句文本。
 */
async function backfillOrderPayStatus(queryRunner: QueryRunner): Promise<void> {
  const manager = queryRunner.manager;

  await manager.update(
    Order,
    {
      status: In([
        OrderStatus.Completed,
        OrderStatus.Accepted,
        OrderStatus.Preparing,
        OrderStatus.Ready,
      ]),
    },
    { payStatus: PayStatus.Paid },
  );

  await manager.update(
    Order,
    { status: In([OrderStatus.Cancelled, OrderStatus.Refunded]) },
    { payStatus: PayStatus.Refunded },
  );
}

export class AddPaymentDomain1791000000000 implements MigrationInterface {
  name = 'AddPaymentDomain1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(paymentTable());
    await queryRunner.createTable(paymentRefundTable());
    await queryRunner.createTable(paymentNotifyLogTable());

    await queryRunner.addColumns('order_info', [new TableColumn(payStatusColumn())]);
    await queryRunner.createIndex(
      'order_info',
      new TableIndex(payStatusIndex()),
    );

    await backfillOrderPayStatus(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 逆序回滚：order_info 的索引 -> 三张新表（先子后父）-> order_info 的新列
    await queryRunner.dropIndex('order_info', payStatusIndex().name!);
    await queryRunner.dropTable('payment_notify_log', true);
    await queryRunner.dropTable('payment_refund', true);
    await queryRunner.dropTable('payment', true);
    await queryRunner.dropColumn('order_info', 'pay_status');
  }
}
