import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SmsConfig } from '../../database/entities/sms-config.entity';
import { AuditModule } from '../audit/audit.module';
import { AliyunSmsProvider } from './drivers/aliyun-sms.provider';
import { CustomSmsProvider } from './drivers/custom-sms.provider';
import { LogSmsProvider } from './drivers/log-sms.provider';
import { TencentSmsProvider } from './drivers/tencent-sms.provider';
import { PlatformSmsConfigController } from './platform-sms-config.controller';
import { SmsConfigService } from './sms-config.service';
import { SmsProviderRegistry } from './sms-provider.registry';
import { SmsService } from './sms.service';

/**
 * 短信验证码域。
 *
 * 与云打印机厂商域同构：凭据是平台与厂商之间的一份合同，
 * 商户与门店永远只看到「获取验证码」这个按钮，看不到 AccessKey 与签名。
 *
 * 四个驱动按配置选：`aliyun` / `tencent` 真发（签名各自自研，不引 SDK），
 * `custom` 把验证码 POST 给平台自己指定的 HTTP 网关（运营商或第三方小通道），
 * `log` 只把验证码写进服务日志（生产禁用），让「发码 → 校验 → 登录」在本机就能跑通。
 * 新增通道只写一个 provider 并在 `SmsProviderRegistry` 里登记。
 *
 * 导出 `SmsService` 给顾客端登录接口，导出 `SmsConfigService` 供自检与后续扩展取生效配置。
 */
@Module({
  imports: [TypeOrmModule.forFeature([SmsConfig]), AuditModule],
  controllers: [PlatformSmsConfigController],
  providers: [
    LogSmsProvider,
    AliyunSmsProvider,
    TencentSmsProvider,
    CustomSmsProvider,
    SmsProviderRegistry,
    SmsConfigService,
    SmsService,
  ],
  exports: [SmsService, SmsConfigService],
})
export class SmsModule {}
