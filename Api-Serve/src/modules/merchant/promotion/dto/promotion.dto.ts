import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  CouponScopeType,
  PromotionStatus,
  PromotionType,
} from '../../../../common/constants/dict';
import { Trimmed } from '../../../../common/decorators/trimmed.decorator';
import { PageQueryDto } from '../../../../common/dto/page-query.dto';

const DATE_TIME_RULE =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?(Z|[+-]\d{2}:?\d{2})?)?$/;

export class CreatePromotionDto {
  @ApiProperty({ description: '活动名称，只在商家端识别用' })
  @IsString()
  @IsNotEmpty({ message: '活动名称不能为空' })
  @Trimmed()
  @MaxLength(64)
  name!: string;

  @ApiPropertyOptional({ description: '顾客端角标文字，留空用「活动」' })
  @IsOptional()
  @IsString()
  @Trimmed()
  @MaxLength(16)
  badge?: string | null;

  @ApiProperty({ enum: Object.values(PromotionType), description: 'price=活动价，discount=折扣' })
  @IsEnum(PromotionType, { message: '优惠算法只能是 price 或 discount' })
  type!: PromotionType;

  @ApiPropertyOptional({ description: 'type=price 时必填：活动价（元）' })
  @ValidateIf((dto: CreatePromotionDto) => dto.type === PromotionType.Price)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: '活动价最多两位小数' })
  @Min(0.01, { message: '活动价要大于 0' })
  @Max(99999)
  price?: number | null;

  @ApiPropertyOptional({ description: 'type=discount 时必填：实付比例，0.6 表示 6 折' })
  @ValidateIf((dto: CreatePromotionDto) => dto.type === PromotionType.Discount)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: '折扣最多四位小数' })
  @Min(0.01, { message: '折扣比例要大于 0' })
  @Max(0.99, { message: '折扣比例必须小于 1，0.6 表示 6 折' })
  discount?: number | null;

  @ApiProperty({ enum: Object.values(CouponScopeType), description: '适用范围，与优惠券同一套' })
  @IsEnum(CouponScopeType, { message: '适用范围只能是 all/category/dish' })
  scopeType!: CouponScopeType;

  @ApiPropertyOptional({ description: 'scopeType 非 all 时必填：分类或菜品 ID 列表' })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  scopeIds?: number[] | null;

  @ApiPropertyOptional({ description: '开始时间，留空表示立即开始', example: '2026-10-08 11:00:00' })
  @IsOptional()
  @IsString()
  @Matches(DATE_TIME_RULE, { message: '开始时间格式应为 YYYY-MM-DD HH:mm:ss' })
  @MaxLength(32)
  startsAt?: string | null;

  @ApiPropertyOptional({ description: '结束时间，留空表示长期有效', example: '2026-10-18 23:59:59' })
  @IsOptional()
  @IsString()
  @Matches(DATE_TIME_RULE, { message: '结束时间格式应为 YYYY-MM-DD HH:mm:ss' })
  @MaxLength(32)
  endsAt?: string | null;

  @ApiPropertyOptional({ enum: [PromotionStatus.Enabled, PromotionStatus.Disabled] })
  @IsOptional()
  @IsIn([PromotionStatus.Enabled, PromotionStatus.Disabled])
  status?: PromotionStatus;
}

export class UpdatePromotionDto extends PartialType(CreatePromotionDto) {}

export class PromotionStatusDto {
  @ApiProperty({ enum: [PromotionStatus.Enabled, PromotionStatus.Disabled] })
  @IsIn([PromotionStatus.Enabled, PromotionStatus.Disabled])
  status!: PromotionStatus;
}

export class PromotionQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: [PromotionStatus.Enabled, PromotionStatus.Disabled] })
  @IsOptional()
  @IsIn([PromotionStatus.Enabled, PromotionStatus.Disabled])
  status?: PromotionStatus;
}
