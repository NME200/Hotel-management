import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception';
import { SMS_DRIVER_LABELS, type SmsDriver } from './constants/sms-driver.constant';
import type { SmsProvider } from './sms-provider.interface';
import { AliyunSmsProvider } from './drivers/aliyun-sms.provider';
import { CustomSmsProvider } from './drivers/custom-sms.provider';
import { LogSmsProvider } from './drivers/log-sms.provider';
import { TencentSmsProvider } from './drivers/tencent-sms.provider';

/**
 * 短信通道注册表。
 *
 * 与 `CloudPrintProviderRegistry`、`PaymentProviderRegistry` 同一形态：
 * 新增通道只需写一个 provider 并在构造函数里 register，
 * `SmsService` 与配置层都不需要再加一条 `if (driver === …)`。
 */
@Injectable()
export class SmsProviderRegistry {
  private readonly providers = new Map<string, SmsProvider>();

  constructor(
    log: LogSmsProvider,
    aliyun: AliyunSmsProvider,
    tencent: TencentSmsProvider,
    custom: CustomSmsProvider,
  ) {
    for (const provider of [log, aliyun, tencent, custom]) {
      this.register(provider);
    }
  }

  register(provider: SmsProvider): void {
    this.providers.set(provider.driver, provider);
  }

  has(driver: SmsDriver): boolean {
    return this.providers.has(driver);
  }

  /**
   * 发码与自检的共同入口：通道没有实现时给出**能照做**的提示。
   *
   * 这句话会出现在顾客登录页的报错里，所以不能说「配置错误」，
   * 要说清去找谁、以及此刻还能怎么登录。
   */
  require(driver: SmsDriver): SmsProvider {
    const instance = this.providers.get(driver);
    if (!instance) {
      throw BusinessException.badRequest(
        `短信通道「${SMS_DRIVER_LABELS[driver]}」尚未接入实现，请在「短信配置」中改选受支持的通道`,
      );
    }
    return instance;
  }
}
