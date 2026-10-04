import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 平台端保存云打印机厂商配置。
 *
 * 与支付渠道配置完全同构的两个约定：
 * - 密钥字段（apiKey / clientSecret）传 `********` 或不传表示不修改，
 *   传空串表示清除 —— 不这样做，前端把掩码写回库里就等于把密钥覆盖掉；
 * - 账号类字段（uid / clientId）是明文，可以正常回填。
 */
export class UpdatePrintProviderDto {
  @ApiPropertyOptional({ description: '厂商总开关' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: '飞鹅账号 uid（明文）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  uid?: string | null;

  @ApiPropertyOptional({ description: '易联云应用 client_id（明文）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientId?: string | null;

  @ApiPropertyOptional({ description: '网关地址覆盖，留空用官方地址' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  baseUrl?: string | null;

  @ApiPropertyOptional({
    description: '密钥字段，值为 "********" 或不传表示不修改，空串表示清除',
  })
  @IsOptional()
  @IsObject()
  secrets?: Partial<Record<'apiKey' | 'clientSecret', string>>;
}
