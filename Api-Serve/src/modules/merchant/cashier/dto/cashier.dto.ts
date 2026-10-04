import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DineType } from '../../../../common/constants/dict';
import { Trimmed } from '../../../../common/decorators/trimmed.decorator';
import { ClientOrderItemDto } from '../../../client/dto/client-order.dto';

/**
 * 收银台线下点餐建单。
 *
 * 菜品行的校验直接复用顾客端那份 DTO：点的菜、规格、加料的口径必须完全一致，
 * 否则同一个「大份加辣」在收银台与小程序里会被解析成两种订单明细。
 * 金额同样一律由后端算，这里不接受任何价格字段。
 */
export class CreateCashierOrderDto {
  @ApiProperty({ enum: Object.values(DineType), description: '就餐方式' })
  @IsIn(Object.values(DineType))
  dineType!: DineType;

  @ApiProperty({ required: false, description: '桌位 ID，堂食必填；后端据此写入桌号' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tableId?: number;

  @ApiProperty({
    required: false,
    description: '识别到的会员 ID；不传即散客单，不享会员价',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  memberId?: number;

  @ApiProperty({ required: false, description: '就餐人数', minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  peopleCount?: number;

  @ApiProperty({ required: false, description: '备注，会打印在顾客小票上' })
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @ApiProperty({ type: [ClientOrderItemDto], description: '菜品行' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ClientOrderItemDto)
  items!: ClientOrderItemDto[];
}

/** 收银台按手机号认会员。只收手机号，不接受会员 ID —— 顾客报的是号码。 */
export class LookupMemberQueryDto {
  @ApiProperty({ description: '顾客手机号', example: '13800138000' })
  @Trimmed()
  @IsString()
  @Matches(/^\d{6,20}$/, { message: '手机号只能是 6~20 位数字' })
  phone!: string;
}
