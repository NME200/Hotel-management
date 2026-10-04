import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../../../database/entities/customer.entity';
import { Member } from '../../../database/entities/member.entity';
import { Order } from '../../../database/entities/order.entity';
import { OrderItem } from '../../../database/entities/order-item.entity';
import { StoreTable } from '../../../database/entities/store-table.entity';
import { AuditModule } from '../../audit/audit.module';
import { ClientModule } from '../../client/client.module';
import { PaymentModule } from '../../payment/payment.module';
import { CashierController } from './cashier.controller';
import { CashierMemberService } from './cashier-member.service';
import { CashierOrderService } from './cashier-order.service';

/**
 * 收银台。
 *
 * 三条依赖都是「复用而不是重写」：
 * - `ClientModule`：算价服务。收银台报的价必须与小程序算的是同一个数，
 *   所以直接 import 它导出的 `ClientOrderPriceService`，而不是抄一份算价逻辑；
 * - `PaymentModule`：结账复用支付域，收款方式列表也来自同一份渠道配置；
 * - `AuditModule`：线下开单要留痕（谁在什么时候替哪桌开了多少钱的单）。
 *
 * 注意这个模块**没有**自己的订单状态流转与收款实现：下单写 order，
 * 收款走 `POST /merchant/payments`，出餐走 `PATCH /merchant/orders/:id/status`，
 * 打印走 `/merchant/print/*`。收银台只是这些能力的一个人机界面。
 */
@Module({
  imports: [
    AuditModule,
    ClientModule,
    PaymentModule,
    TypeOrmModule.forFeature([Order, OrderItem, Member, Customer, StoreTable]),
  ],
  controllers: [CashierController],
  providers: [CashierMemberService, CashierOrderService],
})
export class CashierModule {}
