import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { StoreStatus } from '../../../../common/constants/dict';
import { Trimmed } from '../../../../common/decorators/trimmed.decorator';

const BUSINESS_HOURS_RULE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateStoreDto {
  @ApiProperty({ description: '门店名称' })
  @IsString()
  @IsNotEmpty({ message: '门店名称不能为空' })
  @Trimmed()
  @MaxLength(128)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  logo?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  province?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  city?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  district?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @ApiProperty({ required: false, description: '经度' })
  @IsOptional()
  @IsNumber()
  longitude?: number | null;

  @ApiProperty({ required: false, description: '纬度' })
  @IsOptional()
  @IsNumber()
  latitude?: number | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notice?: string | null;

  @ApiProperty({
    description: '营业时间段',
    type: [String],
    example: ['10:00-14:00', '17:00-21:00'],
  })
  @IsArray()
  @ArrayMaxSize(8)
  @Matches(BUSINESS_HOURS_RULE, { each: true, message: '营业时间格式应为 HH:mm-HH:mm' })
  businessHours!: string[];

  @ApiProperty({ enum: [StoreStatus.Open, StoreStatus.Closed] })
  @IsIn([StoreStatus.Open, StoreStatus.Closed])
  status!: StoreStatus;
}
