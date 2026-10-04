import { Column, Entity, Index } from 'typeorm';
import {
  AccountStatus,
  PrintMode,
  PrintPaperSize,
  PrintTicketType,
} from '../../common/constants/dict';
import { TenantBaseEntity } from './base.entity';

/**
 * 打印机配置：一个商户可以配多台（前台一台打顾客小票、后厨一台打后厨小票）。
 *
 * `mode = browser` 时是「收银台上的那台本机打印机」，后端只负责提供小票数据，
 * 真正的出纸由商家端页面调用浏览器打印完成；
 * `mode = cloud` 时后端把任务推给厂商网关，`providerKey` / `deviceNo` 是网关凭据。
 *
 * 与支付渠道同一条安全线：云打印机的厂商密钥只落这里、只由平台可见，
 * 商家端能填的只有设备号（sn）与备注。
 */
@Entity('printer', { comment: '商家打印机配置' })
@Index(['merchantId', 'status'])
@Index(['merchantId', 'ticketType'])
export class Printer extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 64, comment: '打印机名称，商家自己识别用' })
  name!: string;

  @Column({
    type: 'varchar',
    length: 16,
    default: PrintMode.Browser,
    comment: '打印方式 browser=浏览器小票机 | cloud=云打印机',
  })
  mode!: PrintMode;

  @Column({
    type: 'varchar',
    length: 16,
    default: PrintTicketType.Customer,
    comment: '负责的票种 customer=顾客小票 | kitchen=后厨小票',
  })
  ticketType!: PrintTicketType;

  @Column({
    type: 'varchar',
    length: 8,
    default: PrintPaperSize.Mm80,
    comment: '纸张宽度 58mm | 80mm',
  })
  paperSize!: PrintPaperSize;

  @Column({
    type: 'varchar',
    length: 16,
    default: AccountStatus.Active,
    comment: '状态 active=启用 | disabled=停用',
  })
  status!: AccountStatus;

  @Column({
    type: 'int',
    default: 1,
    comment: '该票种默认打印份数，单次上限由 PRINT_MAX_COPIES 约束',
  })
  copies!: number;

  @Column({
    type: 'varchar',
    length: 32,
    nullable: true,
    comment: '云打印机厂商机器码 feie|yilianyun，browser 模式为空',
  })
  provider!: string | null;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '云打印机设备号（sn），browser 模式为空',
  })
  deviceNo!: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '备注，例如「前台收银机」',
  })
  remark!: string | null;
}
