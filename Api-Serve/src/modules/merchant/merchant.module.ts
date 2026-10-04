import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../../database/entities/category.entity';
import { Dish } from '../../database/entities/dish.entity';
import { DishOptionGroup } from '../../database/entities/dish-option-group.entity';
import { DishSku } from '../../database/entities/dish-sku.entity';
import { Member } from '../../database/entities/member.entity';
import { MerchantStaff } from '../../database/entities/merchant-staff.entity';
import { Order } from '../../database/entities/order.entity';
import { OrderItem } from '../../database/entities/order-item.entity';
import { Store } from '../../database/entities/store.entity';
import { MemberGrowthModule } from '../member-growth/member-growth.module';
import { Activity } from '../../database/entities/activity.entity';
import { Promotion } from '../../database/entities/promotion.entity';
import { ActivityController } from './activity/activity.controller';
import { ActivityService } from './activity/activity.service';
import { PromotionController } from './promotion/promotion.controller';
import { PromotionService } from './promotion/promotion.service';
import { UploadModule } from './upload/upload.module';
import { CategoryController } from './category/category.controller';
import { CategoryService } from './category/category.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { DishController } from './dish/dish.controller';
import { DishService } from './dish/dish.service';
import { OrderController } from './order/order.controller';
import { OrderService } from './order/order.service';
import { PrintModule } from './print/print.module';
import { TableModule } from './table/table.module';
import { CashierModule } from './cashier/cashier.module';
import { StaffController } from './staff/staff.controller';
import { StaffService } from './staff/staff.service';
import { StoreController } from './store/store.controller';
import { StoreService } from './store/store.service';

@Module({
  imports: [
    MemberGrowthModule,
    PrintModule,
    TableModule,
    CashierModule,
    UploadModule,
    TypeOrmModule.forFeature([
      Store,
      Category,
      Dish,
      DishSku,
      DishOptionGroup,
      Activity,
      Promotion,
      Order,
      OrderItem,
      Member,
      MerchantStaff,
    ]),
  ],
  controllers: [
    StoreController,
    CategoryController,
    ActivityController,
    PromotionController,
    DishController,
    OrderController,
    StaffController,
    DashboardController,
  ],  providers: [
    StoreService,
    CategoryService,
    ActivityService,
    PromotionService,
    DishService,
    OrderService,
    StaffService,
    DashboardService,
  ],
  // 平台端只读穿透接口复用同一批 service，保证两端字段结构一致
  exports: [DishService, OrderService, StaffService],
})
export class MerchantModule {}
