import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AccountStatus } from '../../../../common/constants/dict';
import { Trimmed } from '../../../../common/decorators/trimmed.decorator';
import { StoreTable } from '../../../../database/entities/store-table.entity';

/** 单次批量建桌的上限：一次 50 张，够一家中型店把整层楼建完，也不至于把接口拖垮。 */
export const TABLE_BATCH_MAX = 50;

export class CreateTableDto {
  @ApiProperty({ description: '桌号，店内唯一，如 A01 / 8号桌' })
  @IsString()
  @IsNotEmpty({ message: '桌号不能为空' })
  @Trimmed()
  @MaxLength(32)
  tableNo!: string;

  @ApiProperty({ required: false, description: '区域，如「一楼大厅」' })
  @IsOptional()
  @IsString()
  @Trimmed()
  @MaxLength(32)
  area?: string | null;

  @ApiProperty({ required: false, description: '座位数，仅作提示', minimum: 1, maximum: 99 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  seats?: number | null;

  @ApiProperty({ required: false, description: '排序，越小越靠前', minimum: 0, maximum: 9999 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sort?: number;
}

export class UpdateTableDto extends CreateTableDto {
  @ApiProperty({ enum: [AccountStatus.Active, AccountStatus.Disabled] })
  @IsIn([AccountStatus.Active, AccountStatus.Disabled])
  status!: AccountStatus;
}

export class TableStatusDto {
  @ApiProperty({ enum: [AccountStatus.Active, AccountStatus.Disabled] })
  @IsIn([AccountStatus.Active, AccountStatus.Disabled])
  status!: AccountStatus;
}

export class OpenTableDto {
  @ApiProperty({ required: false, description: '就餐人数，仅作登记与看板展示', minimum: 1, maximum: 99 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  guestCount?: number | null;
}

export class CloseTableDto {
  @ApiProperty({
    required: false,
    description: '强制清台：桌上还有未结账的订单时默认拒绝，确需清台（顾客跑单）才传 true',
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

/**
 * 批量建桌：给一个前缀 + 起止序号，一次生成一串桌号。
 * 一家店 30 张桌逐个点太反人类，所以留这个入口；重名会被唯一索引挡下。
 */
export class BatchCreateTablesDto {
  @ApiProperty({ required: false, description: '桌号前缀，如 A；留空则只有数字' })
  @IsOptional()
  @IsString()
  @Trimmed()
  @MaxLength(8)
  prefix?: string;

  @ApiProperty({ description: '起始序号', minimum: 1, maximum: 9999 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9999)
  startNo!: number;

  @ApiProperty({ description: '生成数量', minimum: 1, maximum: TABLE_BATCH_MAX })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(TABLE_BATCH_MAX, { message: `一次最多生成 ${TABLE_BATCH_MAX} 张桌位` })
  count!: number;

  @ApiProperty({ required: false, description: '序号补零位数，默认 2（A01）', minimum: 1, maximum: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  padLength?: number;

  @ApiProperty({ required: false, description: '统一区域' })
  @IsOptional()
  @IsString()
  @Trimmed()
  @MaxLength(32)
  area?: string | null;

  @ApiProperty({ required: false, description: '统一座位数' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  seats?: number | null;
}

/** 对外结构就是实体本身，没有需要隐藏的字段（密钥一类的信息这张表里没有）。 */
export type TableItem = StoreTable;

/** 批量建桌结果：成功的桌位 + 被跳过的重名桌号，前端据此提示。 */
export interface BatchCreateResult {
  created: TableItem[];
  skipped: string[];
}
