import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PLATFORM_ROLES } from '../models/platform-account.model';

const USERNAME_RULE = /^[a-zA-Z0-9_]{3,32}$/;
const PHONE_RULE = /^[0-9+\-() ]{6,20}$/;

export class CreatePlatformAccountDto {
  @ApiProperty({ description: '登录账号，只能包含字母、数字、下划线，长度 3-32', example: 'op_zhang' })
  @IsString()
  @Matches(USERNAME_RULE, { message: '登录账号只能包含字母、数字、下划线，长度 3-32' })
  username!: string;

  @ApiProperty({ description: '登录密码，长度 6-64' })
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password!: string;

  @ApiProperty({ description: '姓名', example: '张三' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  realName!: string;

  @ApiPropertyOptional({ description: '联系电话' })
  @IsOptional()
  @IsString()
  @Matches(PHONE_RULE, { message: '联系电话格式不正确' })
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ description: '平台角色', enum: [...PLATFORM_ROLES], example: 'platform_operator' })
  @IsString()
  @IsIn(PLATFORM_ROLES, { message: '平台角色取值不合法' })
  role!: string;
}
