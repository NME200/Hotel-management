import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { Dish } from '../../database/entities/dish.entity';
import { Member } from '../../database/entities/member.entity';
import { Merchant } from '../../database/entities/merchant.entity';
import { MerchantPaymentConfig } from '../../database/entities/merchant-payment-config.entity';
import { MerchantStaff } from '../../database/entities/merchant-staff.entity';
import { Order } from '../../database/entities/order.entity';
import { PlatformUser } from '../../database/entities/platform-user.entity';
import { Store } from '../../database/entities/store.entity';
import { AuditModule } from '../audit/audit.module';
import { MerchantModule } from '../merchant/merchant.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { PlatformDashboardController } from './dashboard/platform-dashboard.controller';
import { PlatformDashboardService } from './dashboard/platform-dashboard.service';
import { MerchantController } from './merchant.controller';
import { MerchantService } from './merchant.service';
import { MerchantViewController } from './merchant-view.controller';
import { MerchantViewService } from './merchant-view.service';
import { PlatformMemberController } from './member/member.controller';
import { PlatformMemberService } from './member/member.service';

/**
 * 平台端模块：商户开通与审核、平台账号、跨租户看板与只读穿透。
 * 平台侧实体不属于任何租户，直接用 Repository；
 * 查看商户内部数据则复用商家端 service，避免两套查询逻辑漂移。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Merchant,
      MerchantStaff,
      MerchantPaymentConfig,
      Store,
      PlatformUser,
      Dish,
      Order,
      Member,
      Customer,
    ]),
    AuditModule,
    MerchantModule,
  ],
  controllers: [
    MerchantController,
    MerchantViewController,
    PlatformMemberController,
    AccountController,
    PlatformDashboardController,
  ],
  providers: [
    MerchantService,
    MerchantViewService,
    PlatformMemberService,
    AccountService,
    PlatformDashboardService,
  ],
  exports: [MerchantService, AccountService],
})
export class PlatformModule {}
