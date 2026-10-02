import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Gender } from '../../../common/constants/dict';
import { Trimmed } from '../../../common/decorators/trimmed.decorator';

export class ClientLoginDto {
  @ApiProperty({ description: 'wx.login 返回的临时凭证 code，一次性有效' })
  @Trimmed()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  code!: string;

  @ApiProperty({
    description: '商户编号：扫码进入时由小程序码 scene 解析，或从门店列表选择',
    example: 'M10001',
  })
  @Trimmed()
  @IsString()
  @MaxLength(32)
  merchantCode!: string;

  @ApiProperty({ description: '微信昵称，可选；用于首次建档时带上', required: false })
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(64)
  nickname?: string;

  @ApiProperty({ description: '微信头像地址，可选', required: false })
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(255)
  avatar?: string;
}

export class ClientRefreshDto {
  @ApiProperty({ description: '登录时下发的 refreshToken' })
  @IsString()
  @MinLength(20)
  refreshToken!: string;
}

export class UpdateClientProfileDto {
  @ApiProperty({ description: '昵称', required: false })
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(64)
  nickname?: string;

  @ApiProperty({ description: '头像地址', required: false })
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(255)
  avatar?: string;

  @ApiProperty({ description: '性别', required: false, enum: Object.values(Gender) })
  @IsOptional()
  @IsIn(Object.values(Gender))
  gender?: Gender;

  @ApiProperty({ description: '手机号，下单或领券后补充', required: false })
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
