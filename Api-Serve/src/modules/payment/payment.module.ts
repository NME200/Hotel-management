import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Merchant } from '../../database/entities/merchant.entity';
import { MerchantPaymentConfig } from '../../database/entities/merchant-payment-config.entity';
import { Order } from '../../database/entities/order.entity';
import { Payment } from '../../database/entities/payment.entity';
import { PaymentChannelConfig } from '../../database/entities/payment-channel-config.entity';
import { PaymentNotifyLog } from '../../database/entities/payment-notify-log.entity';
import { PaymentReconcile } from '../../database/entities/payment-reconcile.entity';
import { PaymentReconcileDetail } from '../../database/entities/payment-reconcile-detail.entity';
import { PaymentRefund } from '../../database/entities/payment-refund.entity';
import { ProfitShare } from '../../database/entities/profit-share.entity';
import { AuditModule } from '../audit/audit.module';
import { MerchantPaymentConfigController } from './merchant-payment-config.controller';
import { MerchantPaymentController } from './merchant-payment.controller';
import { NotifyController } from './notify.controller';
import { PaymentConfigService } from './payment-config.service';
import { PaymentScheduler } from './payment.scheduler';
import { PaymentService } from './payment.service';
import { PlatformMerchantPaymentController } from './platform-merchant-payment.controller';
import { PlatformPaymentChannelController } from './platform-payment-channel.controller';
import { PlatformPaymentController } from './platform-payment.controller';
import { PlatformPaymentService } from './platform-payment.service';
import { PlatformProfitShareController } from './platform-profit-share.controller';
import { PlatformReconcileController } from './platform-reconcile.controller';
import { MockPaymentProvider } from './providers/mock.provider';
import { CashPaymentProvider, OfflineScanPaymentProvider } from './providers/offline.provider';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import { PaymentProfitShareService } from './services/payment-profit-share.service';
import { PaymentReconcileService } from './services/payment-reconcile.service';
import { PlatformProfitShareService } from './services/platform-profit-share.service';
import { PlatformReconcileService } from './services/platform-reconcile.service';

/**
 * 支付域。
 *
 * 已注册三类渠道实现：
 * - `mock`：资质未就绪时跑通全链路（仅非生产）；
 * - `cash` / `offline`：收银台的现金与收款码，进程内即时成功，走同一条状态机；
 * - 微信服务商与支付宝 ISV 的实现等资质到位后各自新增一个 provider 并注册即可，
 *   下单/回调/退款/关单/配置这套主流程不需要改动。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment,
      PaymentRefund,
      PaymentNotifyLog,
      PaymentChannelConfig,
      MerchantPaymentConfig,
      Order,
      Merchant,
      ProfitShare,
      PaymentReconcile,
      PaymentReconcileDetail,
    ]),
    AuditModule,
  ],
  controllers: [
    MerchantPaymentController,
    MerchantPaymentConfigController,
    NotifyController,
    PlatformPaymentChannelController,
    PlatformMerchantPaymentController,
    PlatformPaymentController,
    PlatformProfitShareController,
    PlatformReconcileController,
  ],
  providers: [
    PaymentService,
    PaymentConfigService,
    PlatformPaymentService,
    PaymentScheduler,
    PaymentProfitShareService,
    PlatformProfitShareService,
    PaymentReconcileService,
    PlatformReconcileService,
    PaymentProviderRegistry,
    MockPaymentProvider,
    CashPaymentProvider,
    OfflineScanPaymentProvider,
  ],
  exports: [PaymentService, PaymentConfigService, PaymentProfitShareService, PaymentReconcileService],
})
export class PaymentModule {}
