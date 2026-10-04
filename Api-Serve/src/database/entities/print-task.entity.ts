import { Column, Entity, Index } from 'typeorm';
import {
  PrintMode,
  PrintTaskStatus,
  PrintTicketType,
} from '../../common/constants/dict';
import { TenantBaseEntity } from './base.entity';

/**
 * 打印任务流水：每一次「打小票」这个动作都留一行，无论成功失败。
 *
 * 这是商家最容易扯皮的地方 ——「我这单明明打了」「没打出来啊」，
 * 有这张表就能查出是谁、什么时候、给哪台打印机、打了几次、失败原因是什么。
 *
 * `ticketType` / `mode` / `printerName` 都是**下单时刻的快照**：
 * 打印机配置后来改了或删了，历史流水里的字段不能跟着变，
 * 否则复盘时看到的不是当时真实发生的事。
 */
@Entity('print_task', { comment: '小票打印任务流水' })
@Index(['merchantId', 'status', 'createdAt'])
@Index(['merchantId', 'orderId'])
export class PrintTask extends TenantBaseEntity {
  @Column({ type: 'int', comment: '关联订单 ID' })
  orderId!: number;

  @Column({ type: 'varchar', length: 32, comment: '订单号快照，订单被清时仍能追溯' })
  orderNo!: string;

  @Column({
    type: 'varchar',
    length: 16,
    default: PrintTicketType.Customer,
    comment: '票种 customer=顾客小票 | kitchen=后厨小票',
  })
  ticketType!: PrintTicketType;

  @Column({
    type: 'varchar',
    length: 16,
    default: PrintMode.Browser,
    comment: '打印方式快照 browser | cloud',
  })
  mode!: PrintMode;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '打印机名称快照，未配置打印机时为空',
  })
  printerName!: string | null;

  @Column({ type: 'int', default: 1, comment: '实际打印份数' })
  copies!: number;

  @Column({
    type: 'varchar',
    length: 16,
    default: PrintTaskStatus.Pending,
    comment: '任务状态 pending=待打印 | success=已打印 | failed=打印失败',
  })
  status!: PrintTaskStatus;

  @Column({ type: 'int', default: 0, comment: '已重试次数，上限 PRINT_MAX_RETRY' })
  retryCount!: number;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '失败原因，成功时为空',
  })
  failReason!: string | null;

  @Column({
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '触发来源 auto=出餐自动打印 | manual=手动打印 | retry=失败重试',
  })
  trigger!: string | null;

  @Column({ type: 'int', nullable: true, comment: '操作人 ID，自动打印时为空' })
  operatorId!: number | null;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '操作人姓名快照',
  })
  operatorName!: string | null;

  @Column({
    type: 'datetime',
    nullable: true,
    comment: '打印成功时间，未成功时为空',
  })
  printedAt!: Date | null;
}
