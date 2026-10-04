import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Activity } from '../../database/entities/activity.entity';
import { Category } from '../../database/entities/category.entity';
import { Customer } from '../../database/entities/customer.entity';
import { CouponTemplate } from '../../database/entities/coupon-template.entity';
import { Dish } from '../../database/entities/dish.entity';
import { DishOptionGroup } from '../../database/entities/dish-option-group.entity';
import { DishSku } from '../../database/entities/dish-sku.entity';
import { Member } from '../../database/entities/member.entity';
import { MemberCoupon } from '../../database/entities/member-coupon.entity';
import { Merchant } from '../../database/entities/merchant.entity';
import { MiniProgramConfig } from '../../database/entities/mini-program-config.entity';
import { Order } from '../../database/entities/order.entity';
import { OrderItem } from '../../database/entities/order-item.entity';
import { Payment } from '../../database/entities/payment.entity';
import { Promotion } from '../../database/entities/promotion.entity';
import { Store } from '../../database/entities/store.entity';
import { StoreTable } from '../../database/entities/store-table.entity';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { MemberGrowthModule } from '../member-growth/member-growth.module';
import { PaymentModule } from '../payment/payment.module';
import { ClientAuthController } from './auth/client-auth.controller';
import { ClientAuthService } from './auth/client-auth.service';
import { ClientMemberResolver } from './auth/client-member.resolver';
import { PlatformMiniProgramConfigController } from './config/platform-mini-program.controller';
import { ClientActivityController } from './activity/client-activity.controller';
import { ClientActivityService } from './activity/client-activity.service';
import { MiniProgramConnectivityService } from './config/mini-program-connectivity.service';
import { ClientCouponController } from './coupon/client-coupon.controller';
import { ClientCouponService } from './coupon/client-coupon.service';
import { ClientMemberController } from './member/client-member.controller';
import { ClientMemberService } from './member/client-member.service';
import { ClientMenuController } from './menu/client-menu.controller';
import { ClientMenuService } from './menu/client-menu.service';
import { ClientOrderController } from './order/client-order.controller';
import { ClientOrderService } from './order/client-order.service';
import { ClientOrderPriceService } from './order/client-order-price.service';
import { ClientPaymentController } from './payment/client-payment.controller';
import { ClientPaymentService } from './payment/client-payment.service';
import { ClientPromotionService } from './promotion/client-promotion.service';
import { ClientStoreController } from './store/client-store.controller';
import { ClientStoreService } from './store/client-store.service';
import { MiniProgramConfigModule } from './config/mini-program-config.module';
import { WechatModule } from './wechat/wechat.module';
import { SmsModule } from '../sms/sms.module';

/**
 * 顾客端（微信小程序）接口域，外加平台端的小程序配置。
 *
 * 与商家端、平台端的三条边界：
 * - 令牌同一套签发与会话机制，只是 userType = client 且权限集合恒为空，
 *   所以顾客令牌进不了后台接口，后台令牌也进不了这里（ClientSessionGuard 挡）；
 * - 钱不重复实现：自助支付直接复用 PaymentModule 的 PaymentService，
 *   金额、幂等、回调、关单只有一份逻辑；
 * - 成长值不重复实现：唯一写入口在 GrowthModule，商家端订单完成时调用它。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Merchant,
      Store,
      Customer,
      Activity,
      Category,
      Dish,
      DishSku,
      DishOptionGroup,
      Member,
      Order,
      OrderItem,
      CouponTemplate,
      MemberCoupon,
      MiniProgramConfig,
      Payment,
      Promotion,
      // 扫桌位码定桌与堂食下单都要按 token 反查桌位
      StoreTable,
    ]),
    AuthModule,
    AuditModule,
    PaymentModule,
    MemberGrowthModule,
    // 小程序凭据与微信接口独立成模块：商家端生成桌位码也要用同一份凭据与 access_token 缓存
    MiniProgramConfigModule,
    WechatModule,
    // 手机号验证码登录：短信通道与节流都在这个模块里，顾客端只是它的一个调用方
    SmsModule,
  ],
  controllers: [
    PlatformMiniProgramConfigController,
    ClientStoreController,
    ClientMenuController,
    ClientActivityController,
    ClientAuthController,
    ClientMemberController,
    ClientCouponController,
    ClientOrderController,
    ClientPaymentController,
  ],
  providers: [
    MiniProgramConnectivityService,
    ClientStoreService,
    ClientMenuService,
    ClientActivityService,
    ClientPromotionService,
    ClientAuthService,
    ClientMemberResolver,
    ClientMemberService,
    ClientCouponService,
    ClientOrderPriceService,
    ClientOrderService,
    ClientPaymentService,
  ],
  /**
   * 算价服务对外导出：商家端收银台的线下点餐复用同一套算价逻辑。
   * 会员价、活动价取低、打包费与配送费口径只此一份 ——
   * 「收银台看到的价」与「小程序看到的价」不可能算出两个数。
   */
  exports: [ClientOrderPriceService],
})
export class ClientModule {}
