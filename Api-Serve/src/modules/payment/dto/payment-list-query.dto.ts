import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaymentChannel, PaymentStatus } from '../constants/payment.constant';
import { PageQueryDto } from '../../../common/dto/page-query.dto';

export class PaymentListQueryDto extends PageQueryDto {
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
