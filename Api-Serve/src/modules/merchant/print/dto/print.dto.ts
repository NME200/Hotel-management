import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AccountStatus,
  PRINT_MAX_COPIES,
  PrintMode,
  PrintPaperSize,
  PrintTaskStatus,
  PrintTicketType,
} from '../../../../common/constants/dict';
import { PageQueryDto } from '../../../../common/dto/page-query.dto';
import { Trimmed } from '../../../../common/decorators/trimmed.decorator';
import { Printer } from '../../../../database/entities/printer.entity';
import { PrintTask } from '../../../../database/entities/print-task.entity';

const PROVIDER_LIST = ['feie', 'yilianyun'] as const;

/* ------------------------------ 打印机配置 ------------------------------ */

export class CreatePrinterDto {
  @ApiProperty({ description: '打印机名称，商家自己识别用' })
  @IsString()
  @IsNotEmpty({ message: '打印机名称不能为空' })
  @Trimmed()
  @MaxLength(64)
  name!: string;

  @ApiProperty({ enum: Object.values(PrintMode), default: PrintMode.Browser })
  @IsIn(Object.values(PrintMode))
  mode!: PrintMode;

  @ApiProperty({ enum: Object.values(PrintTicketType), default: PrintTicketType.Customer })
  @IsIn(Object.values(PrintTicketType))
  ticketType!: PrintTicketType;

  @ApiProperty({ enum: Object.values(PrintPaperSize), default: PrintPaperSize.Mm80 })
  @IsIn(Object.values(PrintPaperSize))
  paperSize!: PrintPaperSize;

  @ApiProperty({ description: '该票种默认打印份数', minimum: 1, maximum: PRINT_MAX_COPIES })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PRINT_MAX_COPIES, { message: `单次最多打印 ${PRINT_MAX_COPIES} 份` })
  copies!: number;

  @ApiProperty({
    required: false,
    description: '云打印机厂商机器码，mode=cloud 时必填',
    enum: PROVIDER_LIST,
  })
  @IsOptional()
  @IsIn(PROVIDER_LIST)
  provider?: string | null;

  @ApiProperty({ required: false, description: '云打印机设备号（sn），mode=cloud 时必填' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Trimmed()
  deviceNo?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string | null;
}

export class UpdatePrinterDto extends CreatePrinterDto {
  @ApiProperty({ enum: [AccountStatus.Active, AccountStatus.Disabled] })
  @IsIn([AccountStatus.Active, AccountStatus.Disabled])
  status!: AccountStatus;
}

export class PrinterStatusDto {
  @ApiProperty({ enum: [AccountStatus.Active, AccountStatus.Disabled] })
  @IsIn([AccountStatus.Active, AccountStatus.Disabled])
  status!: AccountStatus;
}

/** 前端可写字段就这些，云厂商密钥不在其中（密钥永远只归平台）。 */
export type PrinterItem = Printer;

/* ------------------------------ 打印任务 ------------------------------ */

export class CreatePrintTaskDto {
  @ApiProperty({ description: '订单 ID' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderId!: number;

  @ApiProperty({
    enum: Object.values(PrintTicketType),
    default: PrintTicketType.Customer,
    required: false,
  })
  @IsOptional()
  @IsIn(Object.values(PrintTicketType))
  ticketType?: PrintTicketType;

  @ApiProperty({
    required: false,
    description: '打印份数，缺省取门店 / 打印机配置',
    minimum: 1,
    maximum: PRINT_MAX_COPIES,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PRINT_MAX_COPIES, { message: `单次最多打印 ${PRINT_MAX_COPIES} 份` })
  copies?: number;

  @ApiProperty({ required: false, description: '打印机 ID，缺省按票种自动选一台启用的' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  printerId?: number;

  @ApiProperty({
    required: false,
    description: '触发来源 auto=自动打印 | manual=手动打印，前端不传时按 manual',
  })
  @IsOptional()
  @IsIn(['auto', 'manual'])
  trigger?: string;
}

/**
 * 打印结果回执。`browser` 模式下真正出纸发生在商家端页面，
 * 前端打印完（或打印失败）后回写这一笔，流水才不会是清一色 pending。
 */
export class ReportPrintTaskDto {
  @ApiProperty({ enum: [PrintTaskStatus.Success, PrintTaskStatus.Failed] })
  @IsIn([PrintTaskStatus.Success, PrintTaskStatus.Failed])
  status!: 'success' | 'failed';

  @ApiProperty({ required: false, description: '失败原因，status=failed 时建议填写' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  failReason?: string;
}

export class PrintTaskQueryDto extends PageQueryDto {
  @ApiProperty({ required: false, enum: Object.values(PrintTaskStatus) })
  @IsOptional()
  @IsIn(Object.values(PrintTaskStatus))
  status?: PrintTaskStatus;

  @ApiProperty({ required: false, enum: Object.values(PrintTicketType) })
  @IsOptional()
  @IsIn(Object.values(PrintTicketType))
  ticketType?: PrintTicketType;

  @ApiProperty({ required: false, description: '按订单号筛选' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  orderNo?: string;

  @ApiProperty({ required: false, description: '下单起始日期 YYYY-MM-DD' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '日期格式应为 YYYY-MM-DD' })
  from?: string;

  @ApiProperty({ required: false, description: '下单结束日期 YYYY-MM-DD' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '日期格式应为 YYYY-MM-DD' })
  to?: string;
}

export type PrintTaskItem = PrintTask;

/* ------------------------------ 小票数据 ------------------------------ */

/** 小票上的一行菜品。金额是「分」，只在渲染时换元。 */
export interface ReceiptLine {
  dishName: string;
  specDesc: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  remark: string;
}

/** 门店抬头快照，打印当时取一次，避免事后改门店名把历史小票也改了。 */
export interface ReceiptShop {
  name: string;
  phone: string;
  address: string;
  logo: string;
}

/**
 * 一张小票渲染所需的全部数据。
 *
 * 后端算好金额与文案，前端只做版面 —— 小票上任何一个数字都不允许前端自己算，
 * 与订单、支付同一口径。
 */
export interface ReceiptData {
  orderId: number;
  orderNo: string;
  pickupCode: string;
  ticketType: PrintTicketType;
  shop: ReceiptShop;
  /** 就餐方式文案，如「堂食」 */
  dineTypeLabel: string;
  tableNo: string;
  peopleCount: number;
  memberNickname: string;
  remark: string;
  orderedAt: string;
  printedAt: string;
  lines: ReceiptLine[];
  itemCount: number;
  copies: number;
  paperSize: PrintPaperSize;
  /** 金额分项，单位「分」 */
  amount: {
    dishCents: number;
    packingCents: number;
    deliveryCents: number;
    discountCents: number;
    payCents: number;
  };
  /** 后厨小票不显示金额，由后端直接告诉前端该不该显示 */
  showAmount: boolean;
  footer: string;
}
