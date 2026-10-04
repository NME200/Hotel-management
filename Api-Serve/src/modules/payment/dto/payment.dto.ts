import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentChannel } from '../constants/payment.constant';

export class CreatePaymentDto {
  @ApiProperty({ description: '待支付订单 ID' })
  @IsInt()
  @Min(1)
  orderId!: number;

  @ApiProperty({
    enum: Object.values(PaymentChannel),
    description: '收款渠道；cash=现金、offline=收款码为线下收款，创建即成功，无需渠道对接',
  })
  @IsIn(Object.values(PaymentChannel))
  channel!: PaymentChannel;

  @ApiProperty({ required: false, description: '微信 JSAPI 付款人 openid' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  payerId?: string;
}

export class CreateRefundDto {
  @ApiProperty({ description: '退款金额（元），不传即全额退款' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @ApiProperty({ required: false, description: '退款原因' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class PaymentQueryDto {
  @ApiProperty({ required: false, description: '是否顺带向渠道查单纠偏' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  sync?: number;
}
