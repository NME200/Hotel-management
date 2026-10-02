import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsCommissionRate } from '../../payment/validators/commission-rate.validator';

const PHONE_RULE = /^[0-9+\-() ]{6,20}$/;
const DATE_TIME_RULE =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * 单渠道抽佣比例。
 * 用 null 显式表达「清除抽佣」，区别于「不传该字段表示保持原值」。
 */
export class ChannelCommissionDto {
  @ApiPropertyOptional({
    description: '抽佣比例，0 ~ 0.1 之间的小数（即 0% ~ 10%），传 null 表示清除',
    example: 0.0038,
    nullable: true,
  })
  @IsOptional()
  @IsCommissionRate()
  wechat?: number | null;

  @ApiPropertyOptional({
    description: '抽佣比例，0 ~ 0.1 之间的小数（即 0% ~ 10%），传 null 表示清除',
    example: 0.005,
    nullable: true,
  })
  @IsOptional()
  @IsCommissionRate()
  alipay?: number | null;
}

/** 商户编号与状态不在资料接口里变更，状态走 PATCH /platform/merchants/:id/status */
export class UpdateMerchantDto {
  @ApiPropertyOptional({ description: '商户名称' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional({ description: '联系人姓名' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  contactName?: string;

  @ApiPropertyOptional({ description: '联系人电话' })
  @IsOptional()
  @IsString()
  @Matches(PHONE_RULE, { message: '联系电话格式不正确' })
  @MaxLength(20)
  contactPhone?: string;

  @ApiPropertyOptional({ description: '商户 Logo 地址' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  logo?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @ApiPropertyOptional({
    description: '服务到期时间，ISO 字符串或 YYYY-MM-DD HH:mm:ss，传空串表示清除到期时间',
    example: '2026-12-31 23:59:59',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(DATE_TIME_RULE, { message: '到期时间格式应为 ISO 字符串或 YYYY-MM-DD HH:mm:ss' })
  expireAt?: string;

  /**
   * 分渠道设置抽佣比例。只对该商户已提交进件的渠道生效 ——
   * 没有进件记录就没有 merchant_payment_config 行可写，此时直接报错而不是静默丢弃，
   * 否则运营会以为设成功了。分账比例在支付成功时快照进 profit_share.rate，
   * 因此这里改动只影响之后的支付，历史账不变。
   */
  @ApiPropertyOptional({
    description: '分渠道抽佣比例，形如 { wechat: 0.0038, alipay: 0.005 }；仅对已进件的渠道生效',
    type: ChannelCommissionDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ChannelCommissionDto)
  profitShareRates?: ChannelCommissionDto;
}
