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
import { PaymentChannel, PaymentStatus, RefundStatus } from '../constants/payment.constant';

/**
 * 平台端支付流水查询。与商家端 PaymentListQueryDto 的差别只有两点：
 * 多了 merchantId（跨租户筛选），且 keyword 兼搜商户名/编号与支付单号交易号。
 */
export class PlatformPaymentQueryDto extends PageQueryDto {
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

  @ApiPropertyOptional({ enum: Object.values(PaymentStatus) })
  @IsOptional()
  @IsIn(Object.values(PaymentStatus))
  status?: PaymentStatus;

  @ApiPropertyOptional({ description: '起始日期 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: '结束日期 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: '订单号，精确匹配' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  orderNo?: string;
}

/** 平台端退款流水查询，字段与支付流水基本一致，只是状态取值不同。 */
export class PlatformRefundQueryDto extends PageQueryDto {
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

  @ApiPropertyOptional({ enum: Object.values(RefundStatus) })
  @IsOptional()
  @IsIn(Object.values(RefundStatus))
  status?: RefundStatus;

  @ApiPropertyOptional({ description: '起始日期 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: '结束日期 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
