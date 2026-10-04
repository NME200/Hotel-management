import { Module } from '@nestjs/common';
import { MiniProgramConfigModule } from '../config/mini-program-config.module';
import { WechatMiniService } from './wechat-mini.service';

/**
 * 微信小程序开放接口：code2session 登录与「一桌一码」的小程序码生成。
 *
 * 导出给商家端桌位模块用 —— 制码是商家触发的动作，
 * 但凭据与 access_token 都归平台，这一条 import 就是两者的交界。
 */
@Module({
  imports: [MiniProgramConfigModule],
  providers: [WechatMiniService],
  exports: [WechatMiniService],
})
export class WechatModule {}
