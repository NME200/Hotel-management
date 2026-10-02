import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PaymentChannel } from '../constants/payment.constant';
import type { PaymentProvider } from './payment-provider.interface';
import { MockPaymentProvider } from './mock.provider';

const CHANNEL_LABELS: Record<PaymentChannel, string> = {
  [PaymentChannel.Wechat]: '微信支付',
  [PaymentChannel.Alipay]: '支付宝',
  [PaymentChannel.Mock]: '模拟支付',
};

/**
 * 渠道注册表。
 *
 * 新增微信/支付宝实现时，只需在这里注入并 register，
 * 业务层（下单/回调/退款/关单）不需要任何改动。
 */
@Injectable()
export class PaymentProviderRegistry {
  private readonly providers = new Map<PaymentChannel, PaymentProvider>();

  constructor(mockProvider: MockPaymentProvider) {
    this.register(mockProvider);
  }

  register(provider: PaymentProvider): void {
    this.providers.set(provider.channel, provider);
  }

  /** 下单入口用：渠道未接入或未配置凭据时给出可操作的错误，而不是抛底层异常。 */
  requireReady(channel: PaymentChannel): PaymentProvider {
    const provider = this.providers.get(channel);
    if (!provider) {
      const available = [...this.providers.values()]
        .filter((item) => item.isReady())
        .map((item) => CHANNEL_LABELS[item.channel])
        .join('、');
      throw BusinessException.badRequest(
        `${CHANNEL_LABELS[channel] ?? channel}尚未接入${available ? `，当前可用渠道：${available}` : ''}`,
      );
    }
    if (!provider.isReady()) {
      throw BusinessException.badRequest(
        `${CHANNEL_LABELS[channel]}尚未完成配置，请检查支付渠道配置或 .env 中的渠道凭据`,
      );
    }
    return provider;
  }

  /** 回调入口用：渠道必须存在，但验签失败由 provider 自己抛出。 */
  resolve(channel: PaymentChannel): PaymentProvider {
    const provider = this.providers.get(channel);
    if (!provider) {
      throw BusinessException.badRequest(`未知的支付渠道回调：${channel}`);
    }
    return provider;
  }
}
