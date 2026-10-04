import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PrintProviderConfig } from '../../database/entities/print-provider-config.entity';
import { AuditModule } from '../audit/audit.module';
import { PlatformPrintProviderController } from './platform-print-provider.controller';
import { PrintProviderConfigService } from './print-provider-config.service';
import { CloudPrintProviderRegistry } from './providers/cloud-print-provider.registry';
import { FeiePrintProvider } from './providers/feie.provider';
import { YilianyunPrintProvider } from './providers/yilianyun.provider';

/**
 * 云打印机厂商域。
 *
 * 单独成模块而不是塞进 print：这里管的是「平台与厂商之间的凭据」，
 * 权限边界只有平台管理员；而 `PrintModule` 管的是「商户这台机器吐不吐纸」，
 * 权限归店长。两者的读写主体、失败处理、审计动作都不一样。
 *
 * 导出配置服务与注册表，供 `PrintModule` 在推单时取生效凭据与厂商实现。
 */
@Module({
  imports: [TypeOrmModule.forFeature([PrintProviderConfig]), AuditModule],
  controllers: [PlatformPrintProviderController],
  providers: [
    PrintProviderConfigService,
    CloudPrintProviderRegistry,
    FeiePrintProvider,
    YilianyunPrintProvider,
  ],
  exports: [PrintProviderConfigService, CloudPrintProviderRegistry],
})
export class PrintProviderModule {}
