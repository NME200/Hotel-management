import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';

export class AuditQueryDto extends PageQueryDto {
  @ApiProperty({ required: false, description: '操作机器码，如 merchant.create' })
  @IsOptional()
  @IsString()
  @MaxLength(48)
  action?: string;

  @ApiProperty({ required: false, description: '对象类型 merchant|account|auth' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  targetType?: string;

  @ApiProperty({ required: false, description: '起始日期 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ required: false, description: '结束日期 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({ required: false, description: '按操作人 ID 精确过滤' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  operatorId?: number;
}
