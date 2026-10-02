import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  Matches,
  MaxLength,
  MinLength,
  NotContains,
} from 'class-validator';

const USERNAME_RULE = /^[a-zA-Z0-9_]{3,32}$/;

export class MerchantLoginDto {
  @ApiProperty({ description: '商户编号', example: 'M10001' })
  @IsString()
  @MaxLength(32)
  merchantCode!: string;

  @ApiProperty({ description: '员工登录账号', example: 'boss' })
  @IsString()
  @Matches(USERNAME_RULE, { message: '登录账号只能包含字母、数字、下划线，长度 3-32' })
  username!: string;

  @ApiProperty({ description: '登录密码' })
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password!: string;
}

export class PlatformLoginDto {
  @ApiProperty({ description: '平台账号', example: 'admin' })
  @IsString()
  @Matches(USERNAME_RULE, { message: '登录账号只能包含字母、数字、下划线，长度 3-32' })
  username!: string;

  @ApiProperty({ description: '登录密码' })
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: '登录时下发的 refreshToken' })
  @IsString()
  @MinLength(20)
  @NotContains(' ', { message: 'refreshToken 格式不正确' })
  refreshToken!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: '当前密码' })
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  oldPassword!: string;

  @ApiProperty({ description: '新密码，至少 6 位' })
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  newPassword!: string;
}
