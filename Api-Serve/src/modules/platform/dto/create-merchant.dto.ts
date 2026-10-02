import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** 商户编号即登录编号，只允许大写字母和数字，长度 3-32 */
const MERCHANT_CODE_RULE = /^[A-Z0-9]{3,32}$/;
/** 与商家端登录账号规则保持一致 */
const USERNAME_RULE = /^[a-zA-Z0-9_]{3,32}$/;
/** 联系电话：手机号或带区号的座机，长度 6-20 */
const PHONE_RULE = /^[0-9+\-() ]{6,20}$/;
/** 接受 ISO 字符串（2026-12-31T23:59:59.000Z）与 'YYYY-MM-DD HH:mm:ss'，也允许只给日期 */
const DATE_TIME_RULE =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?(Z|[+-]\d{2}:?\d{2})?)?$/;

export class CreateMerchantDto {
  @ApiProperty({ description: '商户编号（登录编号），3-32 位大写字母或数字', example: 'M10001' })
  @IsString()
  @Matches(MERCHANT_CODE_RULE, { message: '商户编号只能是大写字母和数字，长度 3-32' })
  code!: string;

  @ApiProperty({ description: '商户名称', example: '老王面馆' })
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  name!: string;

  @ApiProperty({ description: '联系人姓名', example: '王大力' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  contactName!: string;

  @ApiProperty({ description: '联系人电话', example: '13800138000' })
  @IsString()
  @Matches(PHONE_RULE, { message: '联系电话格式不正确' })
  @MaxLength(20)
  contactPhone!: string;

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
    description: '服务到期时间，ISO 字符串或 YYYY-MM-DD HH:mm:ss，不传表示不限期',
    example: '2026-12-31 23:59:59',
  })
  @IsOptional()
  @IsString()
  @Matches(DATE_TIME_RULE, { message: '到期时间格式应为 ISO 字符串或 YYYY-MM-DD HH:mm:ss' })
  @MaxLength(32)
  expireAt?: string;

  @ApiProperty({ description: '商户管理员登录账号', example: 'boss' })
  @IsString()
  @Matches(USERNAME_RULE, { message: '登录账号只能包含字母、数字、下划线，长度 3-32' })
  adminUsername!: string;

  @ApiProperty({ description: '商户管理员姓名', example: '王大力' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  adminRealName!: string;

  @ApiProperty({ description: '商户管理员登录密码，长度 6-64' })
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  adminPassword!: string;
}
