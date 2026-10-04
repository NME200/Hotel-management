import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../../database/entities/order.entity';
import { StoreTable } from '../../../database/entities/store-table.entity';
import { AuditModule } from '../../audit/audit.module';
import { WechatModule } from '../../client/wechat/wechat.module';
import { UploadModule } from '../upload/upload.module';
import { TableController } from './table.controller';
import { TableService } from './table.service';

/**
 * 桌位管理（一桌一码）。
 *
 * 依赖两处外部能力，正是这个功能的两条边界：
 * - `WechatModule`：制码要用平台的 AppID/AppSecret 与 access_token 缓存；
 * - `UploadModule`：生成出来的 PNG 要落进同一套存储（本地磁盘或对象存储）。
 *
 * 顾客端扫桌码进来的解析放在 ClientModule（那边才知道门店上下文），
 * 这里只管商家怎么建桌、改桌、制码、开台清台。
 *
 * 依赖 `Order` 是为了清台前拦一道「桌上还有未结账订单」——这是收银台最容易丢账的地方。
 */
@Module({
  imports: [
    AuditModule,
    UploadModule,
    WechatModule,
    TypeOrmModule.forFeature([StoreTable, Order]),
  ],
  controllers: [TableController],
  providers: [TableService],
})
export class TableModule {}
