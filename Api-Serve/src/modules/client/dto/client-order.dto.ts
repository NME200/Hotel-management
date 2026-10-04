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
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DineType, OrderStatus } from '../../../common/constants/dict';
import { PageQueryDto } from '../../../common/dto/page-query.dto';
import { Trimmed } from '../../../common/decorators/trimmed.decorator';

export class ClientOptionSelectionDto {
  @ApiProperty({ description: '加料/口味分组 ID' })
  @IsInt()
  @Min(1)
  groupId!: number;

  @ApiProperty({ description: '组内选中的选项名称，单选组只给一个' })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  optionNames!: string[];
}

export class ClientOrderItemDto {
  @ApiProperty({ description: '菜品 ID' })
  @IsInt()
  @Min(1)
  dishId!: number;

  @ApiProperty({ required: false, description: '规格 ID，不传即基础份' })
  @IsOptional()
  @IsInt()
  @Min(1)
  skuId?: number;

  @ApiProperty({ required: false, description: '加料与口味选择' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ClientOptionSelectionDto)
  optionSelections?: ClientOptionSelectionDto[];

  @ApiProperty({ description: '数量' })
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}

/**
 * 下单请求。
 *
 * 这里只接受「点了什么」，不接受任何金额字段——
 * 单价、会员价、加料差价、打包费、配送费、优惠券抵扣全部由后端重算，
 * 前端传来的价格一律丢弃（ValidationPipe 的 whitelist 也会把多余字段剔掉）。
 */
export class CreateClientOrderDto {
  @ApiProperty({ enum: Object.values(DineType), description: '就餐方式' })
  @IsIn(Object.values(DineType))
  dineType!: DineType;

  @ApiProperty({
    required: false,
    description:
      '桌位 token（扫桌位码时由 scene 的 t 参数得到）。堂食必填，后端据此反查桌号 —— 不接受手填桌号，否则顾客可以把单下到别桌',
  })
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(64)
  tableToken?: string;

  @ApiProperty({ required: false, description: '就餐人数' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  peopleCount?: number;

  @ApiProperty({ required: false, description: '顾客备注' })
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @ApiProperty({ required: false, description: '使用的会员券 ID' })
  @IsOptional()
  @IsInt()
  @Min(1)
  couponId?: number;

  @ApiProperty({ type: [ClientOrderItemDto], description: '菜品行' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ClientOrderItemDto)
  items!: ClientOrderItemDto[];
}

/** 结算页预览：与下单同一套算价逻辑，只是不落库。 */
export class ClientCheckoutPreviewDto {
  @ApiProperty({ enum: Object.values(DineType) })
  @IsIn(Object.values(DineType))
  dineType!: DineType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  couponId?: number;

  @ApiProperty({ type: [ClientOrderItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ClientOrderItemDto)
  items!: ClientOrderItemDto[];
}

export class ClientOrderQueryDto extends PageQueryDto {
  @ApiProperty({ required: false, enum: Object.values(OrderStatus) })
  @IsOptional()
  @IsIn(Object.values(OrderStatus))
  status?: OrderStatus;

  /** all = 跨门店的全部订单（小程序「我的订单」），默认只看当前这家店 */
  @ApiProperty({ required: false, enum: ['store', 'all'] })
  @IsOptional()
  @IsIn(['store', 'all'])
  scope?: 'store' | 'all';
}

export class CancelClientOrderDto {
  @ApiProperty({ required: false, description: '取消原因' })
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
