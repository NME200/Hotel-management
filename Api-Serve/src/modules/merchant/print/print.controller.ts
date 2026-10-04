import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/auth.decorators';
import {
  CurrentUser,
  MerchantId,
} from '../../../common/decorators/current-user.decorator';
import { AuditContext } from '../../../common/decorators/audit-actor.decorator';
import { Permission } from '../../../common/constants/permission';
import { PrintTicketType, type AccountStatus } from '../../../common/constants/dict';
import type { PageResult } from '../../../common/dto/page-result.dto';
import type { AuditActor } from '../../../common/models/audit-context';
import {
  AuditAction,
  AuditTargetType,
} from '../../audit/constants/audit-action';
import { AuditService } from '../../audit/audit.service';
import { PrintService } from './print.service';
import { PrinterService } from './printer.service';
import {
  CreatePrinterDto,
  CreatePrintTaskDto,
  PrinterStatusDto,
  PrintTaskQueryDto,
  ReportPrintTaskDto,
  UpdatePrinterDto,
  type PrintTaskItem,
  type PrinterItem,
  type ReceiptData,
} from './dto/print.dto';

/**
 * 商家端小票打印。
 *
 * 拆成两组资源：`/merchant/printers` 是打印机配置（能改硬件的只有店长及以上），
 * `/merchant/print/*` 是打印动作与流水（前台、后厨都能打）。
 * 两组权限点刻意分开：前台能打票但不该能删打印机。
 */
@ApiTags('商家端-小票打印')
@Controller('merchant')
export class PrintController {
  constructor(
    private readonly printService: PrintService,
    private readonly printerService: PrinterService,
    private readonly audit: AuditService,
  ) {}

  /* ------------------------------ 打印机配置 ------------------------------ */

  @Get('printers')
  @Permissions(Permission.PrintRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '打印机列表' })
  listPrinters(@MerchantId() merchantId: number): Promise<PrinterItem[]> {
    return this.printerService.list(merchantId);
  }

  @Post('printers')
  @Permissions(Permission.PrinterManage)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '新增打印机' })
  async createPrinter(
    @MerchantId() merchantId: number,
    @Body() dto: CreatePrinterDto,
    @AuditContext() actor: AuditActor,
  ): Promise<PrinterItem> {
    const printer = await this.printerService.create(merchantId, dto);
    await this.audit.record(actor, {
      action: AuditAction.PrinterCreate,
      targetType: AuditTargetType.Printer,
      targetId: printer.id,
      targetName: printer.name,
      detail: { mode: printer.mode, ticketType: printer.ticketType },
    });
    return printer;
  }

  @Patch('printers/:id')
  @Permissions(Permission.PrinterManage)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '修改打印机' })
  async updatePrinter(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePrinterDto,
    @AuditContext() actor: AuditActor,
  ): Promise<PrinterItem> {
    const before = await this.printerService.findById(merchantId, id);
    const printer = await this.printerService.update(merchantId, id, dto);
    await this.audit.record(actor, {
      action: AuditAction.PrinterUpdate,
      targetType: AuditTargetType.Printer,
      targetId: printer.id,
      targetName: printer.name,
      detail: {
        name: { from: before.name, to: printer.name },
        mode: { from: before.mode, to: printer.mode },
        copies: { from: before.copies, to: printer.copies },
        status: { from: before.status, to: printer.status },
      },
    });
    return printer;
  }

  @Patch('printers/:id/status')
  @Permissions(Permission.PrinterManage)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '启用/停用打印机' })
  updatePrinterStatus(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PrinterStatusDto,
  ): Promise<PrinterItem> {
    return this.printerService.updateStatus(merchantId, id, dto.status as AccountStatus);
  }

  @Delete('printers/:id')
  @Permissions(Permission.PrinterManage)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '删除打印机' })
  async removePrinter(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @AuditContext() actor: AuditActor,
  ): Promise<null> {
    const printer = await this.printerService.findById(merchantId, id);
    await this.printerService.remove(merchantId, id);
    await this.audit.record(actor, {
      action: AuditAction.PrinterDelete,
      targetType: AuditTargetType.Printer,
      targetId: id,
      targetName: printer.name,
      detail: { mode: printer.mode, ticketType: printer.ticketType },
    });
    return null;
  }

  /* ------------------------------ 小票数据 ------------------------------ */

  @Get('orders/:id/receipt')
  @Permissions(Permission.PrintRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '取订单小票数据（金额与文案由后端算好，前端只渲染版面）' })
  receipt(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query('ticketType') ticketType?: string,
  ): Promise<ReceiptData> {
    const type = ticketType === PrintTicketType.Kitchen
      ? PrintTicketType.Kitchen
      : PrintTicketType.Customer;
    return this.printService.buildReceipt(merchantId, id, type);
  }

  /* ------------------------------ 打印任务 ------------------------------ */

  @Post('print/tasks')
  @Permissions(Permission.PrintCreate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '创建打印任务，返回任务号后由前端出纸或推给云打印机' })
  createTask(
    @MerchantId() merchantId: number,
    @Body() dto: CreatePrintTaskDto,
    @CurrentUser('id') operatorId: number,
    @CurrentUser('realName') operatorName: string,
  ): Promise<PrintTaskItem> {
    return this.printService.createTask(merchantId, dto, {
      id: operatorId,
      name: operatorName,
    });
  }

  @Get('print/tasks')
  @Permissions(Permission.PrintRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '分页查询打印流水' })
  pageTasks(
    @MerchantId() merchantId: number,
    @Query() query: PrintTaskQueryDto,
  ): Promise<PageResult<PrintTaskItem>> {
    return this.printService.pageTasks(merchantId, query);
  }

  @Get('print/tasks/order/:orderId')
  @Permissions(Permission.PrintRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '某个订单的打印流水' })
  tasksByOrder(
    @MerchantId() merchantId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
  ): Promise<PrintTaskItem[]> {
    return this.printService.listTasksByOrder(merchantId, orderId);
  }

  @Patch('print/tasks/:id/report')
  @Permissions(Permission.PrintCreate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '回执打印结果（浏览器出纸成功后由前端回写）' })
  reportTask(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReportPrintTaskDto,
  ): Promise<PrintTaskItem> {
    return this.printService.reportTask(merchantId, id, dto);
  }

  @Patch('print/tasks/:id/retry')
  @Permissions(Permission.PrintCreate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '重试失败的打印任务' })
  async retryTask(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @AuditContext() actor: AuditActor,
    @CurrentUser('id') operatorId: number,
    @CurrentUser('realName') operatorName: string,
  ): Promise<PrintTaskItem> {
    const task = await this.printService.retryTask(merchantId, id, {
      id: operatorId,
      name: operatorName,
    });
    await this.audit.record(actor, {
      action: AuditAction.PrintTaskRetry,
      targetType: AuditTargetType.PrintTask,
      targetId: task.id,
      targetName: task.orderNo,
      detail: { retryCount: task.retryCount, ticketType: task.ticketType },
    });
    return task;
  }
}
