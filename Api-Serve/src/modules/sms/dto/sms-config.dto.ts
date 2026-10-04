import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { SMS_DRIVERS, type SmsDriver } from '../constants/sms-driver.constant';

/**
 * 平台端保存短信配置。
 *
 * 与支付渠道、云打印机厂商配置同构的两条约定：
 * - 密钥（`accessKeySecret`=云厂商 Secret、`customToken`=自定义网关密钥）传 `********`
 *   或不传表示**不修改**，传空串才是清除 —— 不这样做，前端把掩码写回去就等于把密钥覆盖掉；
 * - 其余字段是明文，可以正常回填。
 *
 * 保存不要求一次配齐：可以先存半成品，界面按「还缺什么」提示运营。
 * 但自定义通道的网关地址与请求体模板一旦填了就必须是**能用**的形状
 * （形状校验在 `SmsConfigService` 里做，因为文案要跟着通道口径走）。
 */
export class UpdateSmsConfigDto {
  @ApiPropertyOptional({ description: '短信验证码总开关' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    enum: [...SMS_DRIVERS],
    description: '通道；null 表示跟随 .env',
  })
  @IsOptional()
  @IsIn([...SMS_DRIVERS])
  driver?: SmsDriver | null;

  @ApiPropertyOptional({ description: '云厂商 AccessKey ID / 腾讯云 SecretId（明文）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  accessKeyId?: string | null;

  @ApiPropertyOptional({ description: '腾讯云短信应用 SdkAppId' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sdkAppId?: string | null;

  @ApiPropertyOptional({ description: '短信签名（云厂商审核通过的那个名字）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  signName?: string | null;

  @ApiPropertyOptional({ description: '验证码模板号：阿里云 SMS_xxx / 腾讯云数字模板 ID，模板变量名固定为 code' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  templateCode?: string | null;

  @ApiPropertyOptional({ description: '地域，如 cn-hangzhou / ap-guangzhou' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  region?: string | null;

  @ApiPropertyOptional({ description: '网关地址：云厂商是覆盖项，自定义通道是网关本身' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  endpoint?: string | null;

  @ApiPropertyOptional({ description: '自定义通道鉴权头，形如 Authorization: Bearer {token}' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  customAuthHeader?: string | null;

  @ApiPropertyOptional({ description: '自定义通道请求体 JSON 模板，占位符 {phone} {code} {signName} {templateCode}' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  customBodyTemplate?: string | null;

  @ApiPropertyOptional({
    description: '密钥字段，值为 "********" 或不传表示不修改，空串表示清除',
  })
  @IsOptional()
  @IsObject()
  secrets?: Partial<Record<'accessKeySecret' | 'customToken', string>>;
}
