import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';
import { PaymentChannel } from '../constants/payment.constant';
import { ProfitShareStatus } from '../constants/profit-share.constant';

/**
 * 平台端分账查询。视图按「支付单」聚合（同一支付单的平台侧与商户侧
 * 两条记录合并为一行），因此状态筛选用的是合并后的主状态。
 */
export class PlatformProfitShareQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '按商户筛选' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  merchantId?: number;

  @ApiPropertyOptional({ enum: Object.values(PaymentChannel) })
  @IsOptional()
  @IsIn(Object.values(PaymentChannel))
  channel?: PaymentChannel;

  @ApiPropertyOptional({ enum: Object.values(ProfitShareStatus) })
  @IsOptional()
  @IsIn(Object.values(ProfitShareStatus))
  status?: ProfitShareStatus;

  @ApiPropertyOptional({ description: '起始日期 YYYY-MM-DD（按解冻到期日筛）' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: '结束日期 YYYY-MM-DD（按解冻到期日筛）' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: '订单号，精确匹配' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  orderNo?: string;
}
