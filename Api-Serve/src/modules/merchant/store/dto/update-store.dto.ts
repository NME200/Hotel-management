import { ApiProperty } from '@nestjs/swagger';
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
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { StoreStatus, PRINT_MAX_COPIES } from '../../../../common/constants/dict';
import { Trimmed } from '../../../../common/decorators/trimmed.decorator';

const BUSINESS_HOURS_RULE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

/** 自动打印触发时机：接单后或出餐后，两者都是门店真实存在的出票习惯。 */
const AUTO_PRINT_ON = ['accepted', 'ready'] as const;

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

  @ApiProperty({ description: '接单/出餐后是否自动打印小票', default: false })
  @IsBoolean()
  autoPrint!: boolean;

  @ApiProperty({
    enum: AUTO_PRINT_ON,
    description: '自动打印触发时机 accepted=接单后 | ready=出餐后',
    default: 'accepted',
  })
  @IsIn(AUTO_PRINT_ON)
  autoPrintOn!: string;

  @ApiProperty({
    description: '顾客小票默认份数',
    minimum: 1,
    maximum: PRINT_MAX_COPIES,
    default: 1,
  })
  @IsInt()
  @Min(1)
  @Max(PRINT_MAX_COPIES, { message: `单次最多打印 ${PRINT_MAX_COPIES} 份` })
  customerCopies!: number;
}
