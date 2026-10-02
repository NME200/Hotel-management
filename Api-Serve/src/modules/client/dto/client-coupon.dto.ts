import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { MemberCouponStatus } from '../../../common/constants/dict';
import { Trimmed } from '../../../common/decorators/trimmed.decorator';

export class ClientCouponQueryDto {
  @ApiProperty({ required: false, enum: Object.values(MemberCouponStatus) })
  @IsOptional()
  @IsEnum(MemberCouponStatus)
  status?: MemberCouponStatus;
}

export class ClaimCouponDto {
  @ApiProperty({ description: '券模板 ID，来自 /client/coupons/claimable' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  templateId!: number;
}

export class RedeemCouponDto {
  @ApiProperty({ description: '兑换码', example: 'NEW2026' })
  @Trimmed()
  @IsString()
  @MaxLength(16)
  code!: string;
}
