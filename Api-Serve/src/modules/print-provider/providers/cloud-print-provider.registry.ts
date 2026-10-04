import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PRINT_PROVIDER_LABELS, type PrintProvider } from '../constants/print-provider.constant';
import type { EffectivePrintProviderConfig } from '../models/print-provider.model';
import type { CloudPrintProvider } from './cloud-print-provider.interface';
import { FeiePrintProvider } from './feie.provider';
import { YilianyunPrintProvider } from './yilianyun.provider';

/**
 * 云打印机厂商注册表。
 *
 * 与 `PaymentProviderRegistry` 同一形态：新增厂商只需写一个 provider
 * 并在构造函数里 register，`PrintService` 不需要任何改动。
 */
@Injectable()
export class CloudPrintProviderRegistry {
  private readonly providers = new Map<string, CloudPrintProvider>();

  constructor(feie: FeiePrintProvider, yilianyun: YilianyunPrintProvider) {
    this.register(feie);
    this.register(yilianyun);
  }

  register(provider: CloudPrintProvider): void {
    this.providers.set(provider.provider, provider);
  }

  has(provider: string): boolean {
    return this.providers.has(provider);
  }

  /**
   * 推单入口用：厂商未接入或凭据未就绪时给出**可照做**的错误。
   *
   * 这段提示会直接显示在商家端的打印失败原因里，所以要说清「找谁」——
   * 商家自己既没有厂商账号也没有密钥，一句"配置错误"会变成无效工单。
   */
  requireReady(provider: string, config: EffectivePrintProviderConfig): CloudPrintProvider {
    const instance = this.providers.get(provider);
    if (!instance) {
      throw BusinessException.badRequest(
        `打印机厂商「${provider}」尚未接入，请在「打印设置」中改选受支持的厂商`,
      );
    }
    if (!config.enabled) {
      throw BusinessException.badRequest(
        `${PRINT_PROVIDER_LABELS[provider as PrintProvider] ?? provider}已被平台关闭，请联系平台运营`,
      );
    }
    if (config.missingFields.length > 0) {
      throw BusinessException.badRequest(
        `${PRINT_PROVIDER_LABELS[provider as PrintProvider] ?? provider}尚未完成配置（缺少：${config.missingFields.join('、')}），请联系平台运营`,
      );
    }
    return instance;
  }
}
