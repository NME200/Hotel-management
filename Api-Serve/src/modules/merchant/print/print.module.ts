import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderItem } from '../../../database/entities/order-item.entity';
import { Order } from '../../../database/entities/order.entity';
import { Printer } from '../../../database/entities/printer.entity';
import { PrintTask } from '../../../database/entities/print-task.entity';
import { Store } from '../../../database/entities/store.entity';
import { AuditModule } from '../../audit/audit.module';
import { PrintProviderModule } from '../../print-provider/print-provider.module';
import { PrintController } from './print.controller';
import { PrintService } from './print.service';
import { PrinterService } from './printer.service';

/**
 * 小票打印。
 *
 * 单独成模块而不是塞进 order：订单模块管的是「这一单处于什么状态」，
 * 打印管的是「这台硬件有没有把票吐出来」，两者的失败处理与权限边界都不一样。
 *
 * 导出 PrintService 供 OrderService 在状态流转时触发自动打印 ——
 * 自动打印失败不应拖垮订单流转，因此调用方拿到 null / 异常都要吞掉。
 *
 * 依赖 `PrintProviderModule` 是为了拿云打印机的生效凭据与厂商实现：
 * 凭据归平台，推单归商家，这一条 import 就是两者的交界。
 */
@Module({
  imports: [
    AuditModule,
    PrintProviderModule,
    TypeOrmModule.forFeature([Printer, PrintTask, Order, OrderItem, Store]),
  ],
  controllers: [PrintController],
  providers: [PrintService, PrinterService],
  exports: [PrintService, PrinterService],
})
export class PrintModule {}
