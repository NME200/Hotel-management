import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';
import { PaymentChannel } from '../constants/payment.constant';
import { ReconcileStatus } from '../constants/reconcile.constant';

/** 平台端对账台账查询。粒度是「商户 × 渠道 × 自然日」，所以日期筛的是对账日。 */
export class PlatformReconcileQueryDto extends PageQueryDto {
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

  @ApiPropertyOptional({ enum: Object.values(ReconcileStatus) })
  @IsOptional()
  @IsIn(Object.values(ReconcileStatus))
  status?: ReconcileStatus;

  @ApiPropertyOptional({ description: '起始对账日 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: '结束对账日 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

/**
 * 手动补跑。`tradeDate` 必填而不给默认值，是因为"补跑"这个动作
 * 一定要有人明确负责的那一天——默认成"昨天"会让人误以为跑的是别处。
 */
export class RunReconcileDto {
  @ApiPropertyOptional({ description: '对账日 YYYY-MM-DD' })
  @IsDateString()
  tradeDate!: string;

  @ApiPropertyOptional({ enum: Object.values(PaymentChannel), description: '只对某渠道；不传则全部启用渠道' })
  @IsOptional()
  @IsIn(Object.values(PaymentChannel))
  channel?: PaymentChannel;
}
