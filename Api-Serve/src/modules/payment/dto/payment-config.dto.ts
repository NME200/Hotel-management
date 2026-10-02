import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentChannel } from '../constants/payment.constant';
import { MerchantPaymentStatus } from '../models/payment-config.model';
import { PageQueryDto } from '../../../common/dto/page-query.dto';

const CHANNEL_VALUES = Object.values(PaymentChannel);

export class UpdateChannelConfigDto {
  @ApiPropertyOptional({ description: '渠道总开关' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: '异步通知地址' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notifyUrl?: string | null;

  @ApiPropertyOptional({ description: 'AppID' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  appId?: string | null;

  @ApiPropertyOptional({ description: '微信服务商商户号' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  mchId?: string | null;

  @ApiPropertyOptional({ description: '商户证书序列号' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  serialNo?: string | null;

  @ApiPropertyOptional({ description: '平台公钥 ID' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  publicKeyId?: string | null;

  @ApiPropertyOptional({ description: '支付宝沙箱' })
  @IsOptional()
  @IsBoolean()
  sandbox?: boolean;

  @ApiPropertyOptional({
    description: '密钥字段，值为 "********" 或不传表示不修改，空串表示清除',
  })
  @IsOptional()
  @IsObject()
  secrets?: Partial<Record<'apiKey' | 'privateKey' | 'publicKey', string>>;
}

export class MerchantApplyDto {
  @ApiProperty({ enum: CHANNEL_VALUES })
  @IsIn(CHANNEL_VALUES)
  channel!: PaymentChannel;

  @ApiProperty({ description: '特约商户号 sub_mchid / 支付宝 partner id' })
  @IsString()
  @Matches(/^[0-9A-Za-z]{2,32}$/, { message: '商户号只能是 2-32 位字母或数字' })
  channelAccount!: string;

  @ApiPropertyOptional({ description: '结算户名' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  settleAccountName?: string;

  @ApiPropertyOptional({ description: '结算账号' })
  @IsOptional()
  @Matches(/^\d{12,30}$/, { message: '结算账号应为 12-30 位数字' })
  settleAccountNo?: string;

  @ApiPropertyOptional({ description: '营业执照号，18 位' })
  @IsOptional()
  @Matches(/^[0-9A-Za-z]{18}$/, { message: '营业执照号应为 18 位字母或数字' })
  licenseNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^1[3-9]\d{9}$|^0\d{2,3}-?\d{7,8}$/, { message: '联系电话格式不正确' })
  contactPhone?: string;
}

export class MerchantAuditDto {
  @ApiProperty({ description: 'true 通过，false 驳回' })
  @IsBoolean()
  approved!: boolean;

  @ApiPropertyOptional({ description: '审核意见，驳回时必填' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  auditRemark?: string;

  @ApiPropertyOptional({ description: '审核通过时设定渠道费率，如 0.006' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.2)
  feeRate?: number;

  @ApiPropertyOptional({ description: '审核通过时设定平台抽佣比例，如 0.0038' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.5)
  profitShareRate?: number;
}

export class SetMerchantPaymentStatusDto {
  @ApiProperty({ enum: [MerchantPaymentStatus.Enabled, MerchantPaymentStatus.Disabled] })
  @IsIn([MerchantPaymentStatus.Enabled, MerchantPaymentStatus.Disabled])
  status!: typeof MerchantPaymentStatus.Enabled | typeof MerchantPaymentStatus.Disabled;
}

/** not_applied 是合成状态，进件表里没有对应记录，按它筛选只会得到空列表，所以不放进可筛选项。 */
const PAGEABLE_MERCHANT_PAYMENT_STATUSES = Object.values(MerchantPaymentStatus).filter(
  (value) => value !== MerchantPaymentStatus.NotApplied,
);

export class MerchantPaymentPageQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: PAGEABLE_MERCHANT_PAYMENT_STATUSES })
  @IsOptional()
  @IsIn(PAGEABLE_MERCHANT_PAYMENT_STATUSES)
  status?: MerchantPaymentStatus;

  @ApiPropertyOptional({ enum: CHANNEL_VALUES })
  @IsOptional()
  @IsIn(CHANNEL_VALUES)
  channel?: PaymentChannel;

  @ApiPropertyOptional({ description: '按商户精确过滤' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  merchantId?: number;
}
