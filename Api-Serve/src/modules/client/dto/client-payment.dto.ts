import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { Trimmed } from '../../../common/decorators/trimmed.decorator';
import { PaymentChannel } from '../../payment/constants/payment.constant';

export class CreateClientPaymentDto {
  @ApiProperty({ description: '订单号' })
  @Trimmed()
  @IsString()
  @MaxLength(32)
  orderNo!: string;

  @ApiProperty({ enum: Object.values(PaymentChannel), description: '支付渠道' })
  @IsIn(Object.values(PaymentChannel))
  channel!: PaymentChannel;
}
