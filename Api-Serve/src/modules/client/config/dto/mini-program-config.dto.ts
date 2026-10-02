import { Injectable } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trimmed } from '../../../../common/decorators/trimmed.decorator';

export class UpdateMiniProgramConfigDto {
  @ApiProperty({ description: '小程序 AppID，形如 wx1234567890abcdef' })
  @Trimmed()
  @IsString()
  @MaxLength(64)
  appId!: string;

  /**
   * 留空或回传掩码都表示"不修改已保存的密钥"——
   * 后台只会拿到 ********，直接写库等于把密钥覆盖掉。
   */
  @ApiProperty({ description: '小程序 AppSecret；留空或传 ******** 表示沿用原值', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  appSecret?: string;

  @ApiProperty({ description: '是否开放小程序登录', required: false })
  @IsOptional()
  @IsBoolean()
  loginEnabled?: boolean;
}

/** 平台端展示视图：密钥只以「是否已配置 + 掩码 + 指纹」下发，明文永不出后端。 */
export interface MiniProgramConfigView {
  appId: string | null;
  loginEnabled: boolean;
  secretConfigured: boolean;
  secretMasked: string;
  secretFingerprint: string | null;
  source: 'database' | 'env' | 'none';
  configured: boolean;
  missingFields: string[];
  /** `.env` 里是否留了兜底凭据：区分「没配也能登录」与「全靠数据库」 */
  envFallbackAvailable: boolean;
  updatedAt: Date | null;
  updatedByName: string | null;
}

export interface MiniProgramConnectivityResult {
  ok: boolean;
  message: string;
  checkedAt: Date;
}
