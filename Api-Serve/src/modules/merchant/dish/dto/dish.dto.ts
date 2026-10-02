import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DishStatus, OptionGroupType, StockType } from '../../../../common/constants/dict';
import { Trimmed } from '../../../../common/decorators/trimmed.decorator';
import { PageQueryDto } from '../../../../common/dto/page-query.dto';
import { Dish } from '../../../../database/entities/dish.entity';

export class DishSkuInputDto {
  @ApiProperty({ description: '规格名称，如 大份' })
  @IsString()
  @IsNotEmpty()
  @Trimmed()
  @MaxLength(64)
  name!: string;

  @ApiProperty({ description: '规格售价' })
  @IsNumber()
  @Min(0)
  @Max(999999)
  price!: number;

  @ApiProperty({ required: false, description: '规格描述' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  specDesc?: string | null;

  @ApiProperty({ required: false, description: '规格库存，null 表示不限量' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;
}

export class DishOptionItemInputDto {
  @ApiProperty({ description: '选项名称，如 微辣' })
  @IsString()
  @IsNotEmpty()
  @Trimmed()
  @MaxLength(32)
  name!: string;

  @ApiProperty({ description: '加价，可为负数表示减价' })
  @IsNumber()
  @Min(-9999)
  @Max(9999)
  priceDelta!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;
}

export class DishOptionGroupInputDto {
  @ApiProperty({ description: '分组名称，如 辣度' })
  @IsString()
  @IsNotEmpty()
  @Trimmed()
  @MaxLength(64)
  name!: string;

  @ApiProperty({ enum: [OptionGroupType.Single, OptionGroupType.Multi] })
  @IsIn([OptionGroupType.Single, OptionGroupType.Multi])
  type!: OptionGroupType;

  @ApiProperty({ required: false, description: '是否必选' })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiProperty({ type: [DishOptionItemInputDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => DishOptionItemInputDto)
  options!: DishOptionItemInputDto[];
}

export class DishInputDto {
  @ApiProperty({ description: '所属分类 ID' })
  @IsInt()
  @Min(1)
  categoryId!: number;

  @ApiProperty({ description: '菜品名称' })
  @IsString()
  @IsNotEmpty()
  @Trimmed()
  @MaxLength(64)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  subtitle?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  image?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiProperty({ description: '售价' })
  @IsNumber()
  @Min(0)
  @Max(999999)
  price!: number;

  @ApiProperty({ required: false, description: '会员价' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999)
  memberPrice?: number | null;

  @ApiProperty({ required: false, description: '计量单位' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  unit?: string;

  @ApiProperty({ enum: [StockType.Unlimited, StockType.Fixed] })
  @IsIn([StockType.Unlimited, StockType.Fixed])
  stockType!: StockType;

  @ApiProperty({ required: false, description: '库存数量，unlimited 时留空' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isRecommend?: boolean;

  @ApiProperty({ type: [String], description: '标签，最多 10 个' })
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(16, { each: true })
  tags!: string[];

  @ApiProperty({ required: false, enum: [DishStatus.OnSale, DishStatus.OffSale] })
  @IsOptional()
  @IsIn([DishStatus.OnSale, DishStatus.OffSale])
  status?: DishStatus;

  @ApiProperty({ type: [DishSkuInputDto], description: '规格列表，可为空数组' })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DishSkuInputDto)
  skus!: DishSkuInputDto[];

  @ApiProperty({ type: [DishOptionGroupInputDto], description: '加料分组，可为空数组' })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DishOptionGroupInputDto)
  optionGroups!: DishOptionGroupInputDto[];
}

export class UpdateDishDto extends PartialType(DishInputDto) {}

export class UpdateDishStatusDto {
  @ApiProperty({ enum: [DishStatus.OnSale, DishStatus.OffSale] })
  @IsIn([DishStatus.OnSale, DishStatus.OffSale])
  status!: DishStatus;
}

export class DishQueryDto extends PageQueryDto {
  @ApiProperty({ required: false, description: '按分类过滤' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @ApiProperty({ required: false, enum: Object.values(DishStatus) })
  @IsOptional()
  @IsIn([DishStatus.OnSale, DishStatus.OffSale])
  status?: DishStatus;
}

/** 列表项：不带规格与加料，附加分类名，减小分页响应体积。 */
export type DishBrief = Omit<Dish, 'category' | 'skus' | 'optionGroups'> & {
  categoryName: string;
};

export type DishDetail = DishBrief & Pick<Dish, 'skus' | 'optionGroups'>;
