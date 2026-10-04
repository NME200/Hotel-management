import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
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

  @ApiProperty({
    required: false,
    description:
      '「手机号快速验证组件」回调里的 code。带上它就在登录的同时绑定手机号；' +
      '微信侧每次换号收 0.03 元，所以只在顾客点授权时才传',
    maxLength: 128,
  })
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(128)
  phoneCode?: string;
}

/** 已登录顾客单独绑定手机号：只收组件回调的 code，号码本身永不从前端来。 */
export class ClientBindPhoneDto {
  @ApiProperty({ description: 'getPhoneNumber 回调里的 code，一次性有效' })
  @Trimmed()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  code!: string;
}

/**
 * 大陆手机号规则。
 *
 * 只挡格式不挡号段变更，所以写成一处常量而不是每个接口各抄一份正则：
 * 发码与登录两处必须用同一个判断，否则会出现「能发到但登不进」的号。
 */
const PHONE_RULE = /^1[3-9]\d{9}$/;
const PHONE_MESSAGE = '请输入正确的 11 位手机号';

export class SendSmsCodeDto {
  @ApiProperty({ description: '手机号', example: '13800138000' })
  @Trimmed()
  @Matches(PHONE_RULE, { message: PHONE_MESSAGE })
  phone!: string;
}

/**
 * 手机号 + 短信验证码登录，未注册的号码就地建档。
 *
 * `wxCode` 是小程序里静默 `wx.login` 拿到的凭证：带着它，登录的同时把微信身份绑上，
 * 一个微信号在一家店只会有一份会员档案。换不到 openid 时整笔登录失败而不是降级成
 * 「只有手机号的身份」—— 那会留下一条日后必须合并的重复身份。
 */
export class SmsLoginDto {
  @ApiProperty({ description: '手机号', example: '13800138000' })
  @Trimmed()
  @Matches(PHONE_RULE, { message: PHONE_MESSAGE })
  phone!: string;

  @ApiProperty({ description: '短信验证码，6 位数字' })
  @Trimmed()
  @Matches(/^\d{4,8}$/, { message: '验证码是数字' })
  code!: string;

  @ApiProperty({ required: false, description: 'wx.login 的一次性凭证，建议总是带上' })
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(128)
  wxCode?: string;

  @ApiProperty({ description: '门店编号', example: 'M10001' })
  @Trimmed()
  @IsString()
  @MaxLength(32)
  merchantCode!: string;

  @ApiProperty({ required: false, description: '微信昵称，仅新建身份时使用' })
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(64)
  nickname?: string;

  @ApiProperty({ required: false, description: '微信头像，仅新建身份时使用' })
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

  @ApiProperty({
    description: '当前门店编号：续期要顺带返回这家的会员档案，小程序请求层会自动注入',
    example: 'M10001',
  })
  @Trimmed()
  @IsString()
  @MaxLength(32)
  merchantCode!: string;
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
