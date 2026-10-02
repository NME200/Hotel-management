import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AccountStatus } from '../../../common/constants/dict';
import { PLATFORM_ROLES } from '../models/platform-account.model';

const PHONE_RULE = /^[0-9+\-() ]{6,20}$/;

/** 登录账号与商户归属不可变更；password 传了就重置密码 */
export class UpdatePlatformAccountDto {
  @ApiPropertyOptional({ description: '姓名' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  realName?: string;

  @ApiPropertyOptional({ description: '联系电话' })
  @IsOptional()
  @IsString()
  @Matches(PHONE_RULE, { message: '联系电话格式不正确' })
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: '平台角色', enum: [...PLATFORM_ROLES] })
  @IsOptional()
  @IsString()
  @IsIn(PLATFORM_ROLES, { message: '平台角色取值不合法' })
  role?: string;

  @ApiPropertyOptional({
    description: '账号状态：disabled 即禁用账号',
    enum: AccountStatus,
    example: AccountStatus.Active,
  })
  @IsOptional()
  @IsIn(Object.values(AccountStatus), { message: '账号状态取值不合法' })
  status?: AccountStatus;

  @ApiPropertyOptional({ description: '重置后的登录密码，长度 6-64，不传表示不改密码' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password?: string;
}
