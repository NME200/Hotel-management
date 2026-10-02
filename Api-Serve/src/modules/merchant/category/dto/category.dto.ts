import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CategoryStatus } from '../../../../common/constants/dict';
import { Trimmed } from '../../../../common/decorators/trimmed.decorator';
import { PageQueryDto } from '../../../../common/dto/page-query.dto';
import { Category } from '../../../../database/entities/category.entity';

export class CreateCategoryDto {
  @ApiProperty({ description: '分类名称' })
  @IsString()
  @IsNotEmpty({ message: '分类名称不能为空' })
  @Trimmed()
  @MaxLength(64)
  name!: string;

  @ApiProperty({ required: false, description: '排序值，越小越靠前' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sort?: number;

  @ApiProperty({ required: false, enum: [CategoryStatus.Enabled, CategoryStatus.Disabled] })
  @IsOptional()
  @IsIn([CategoryStatus.Enabled, CategoryStatus.Disabled])
  status?: CategoryStatus;

  @ApiProperty({ required: false, description: '分类图标地址' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  image?: string | null;
}

export class UpdateCategoryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '分类名称不能为空' })
  @Trimmed()
  @MaxLength(64)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sort?: number;

  @ApiProperty({ required: false, enum: [CategoryStatus.Enabled, CategoryStatus.Disabled] })
  @IsOptional()
  @IsIn([CategoryStatus.Enabled, CategoryStatus.Disabled])
  status?: CategoryStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  image?: string | null;
}

export class CategoryQueryDto extends PageQueryDto {
  @ApiProperty({ required: false, enum: Object.values(CategoryStatus) })
  @IsOptional()
  @IsIn([CategoryStatus.Enabled, CategoryStatus.Disabled])
  status?: CategoryStatus;
}

/** 列表项在分类实体上附带菜品数，供商家端展示"该分类下有 N 个菜品"。 */
export type CategoryItem = Category & { dishCount: number };
