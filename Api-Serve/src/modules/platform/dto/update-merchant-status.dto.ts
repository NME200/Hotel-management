import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { MerchantStatus } from '../../../common/constants/dict';

export class UpdateMerchantStatusDto {
  @ApiProperty({
    description: '目标状态：审核通过用 active，其余为 disabled / expired / pending_audit',
    enum: MerchantStatus,
    example: MerchantStatus.Active,
  })
  @IsEnum(MerchantStatus, { message: '商户状态取值不合法' })
  status!: MerchantStatus;
}
