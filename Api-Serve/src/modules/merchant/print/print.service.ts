import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  type FindOptionsWhere,
  In,
  LessThanOrEqual,
  Like,
  MoreThanOrEqual,
  type Repository,
} from 'typeorm';
import {
  AccountStatus,
  DINE_TYPE_LABELS,
  PrintMode,
  PrintTaskStatus,
  PrintTicketType,
  PRINT_MAX_COPIES,
  PRINT_MAX_RETRY,
} from '../../../common/constants/dict';
import { buildPageResult, type PageResult } from '../../../common/dto/page-result.dto';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { endOfDay, startOfDay } from '../../../common/utils/date.util';
import { likePattern } from '../../../common/utils/like.util';
import { toCents } from '../../../common/utils/money.util';
import { OrderItem } from '../../../database/entities/order-item.entity';
import { Order } from '../../../database/entities/order.entity';
import { Printer } from '../../../database/entities/printer.entity';
import { PrintTask } from '../../../database/entities/print-task.entity';
import { Store } from '../../../database/entities/store.entity';
import {
  PRINT_PROVIDER_LABELS,
  PrintProvider,
} from '../../print-provider/constants/print-provider.constant';
import { PrintProviderConfigService } from '../../print-provider/print-provider-config.service';
import { CloudPrintProviderRegistry } from '../../print-provider/providers/cloud-print-provider.registry';
import {
  type CreatePrintTaskDto,
  type PrintTaskItem,
  type PrintTaskQueryDto,
  type ReceiptData,
  type ReceiptLine,
  type ReportPrintTaskDto,
} from './dto/print.dto';
import { PrinterService } from './printer.service';

/** 小票落款。开票机不出这个就只能靠门店名认店，补打时起不到凭证作用。 */
function receiptFooter(shopName: string): string {
  return `${shopName} · 谢谢光临`;
}

/**
 * 小票打印。
 *
 * 三条贯穿全实现的判断：
 *
 * 1. **打印数据全部由后端算好**。金额、就餐方式文案、份数、是否显示金额，
 *    前端拿到 `ReceiptData` 只做版面渲染。小票是要拿去对账的凭证，
 *    上面任何一个数字都不允许前端自己算 —— 与订单、支付同一口径。
 *
 * 2. **browser 与 cloud 共用同一条任务流水**。两种模式只是「谁来出纸」不同，
 *    对商家而言都是「这一单打没打出来」，所以状态机与留痕必须一致。
 *    browser 模式下任务先落 `pending`，由前端打完回执改 `success` / `failed`。
 *
 * 3. **小票数据是快照，不是关联查询**。菜品名、规格、单价在生成 `ReceiptData`
 *    时才读一次订单明细；订单事后被改价或菜被删，历史小票不受影响。
 */
@Injectable()
export class PrintService {
  private readonly logger = new Logger(PrintService.name);
  private readonly tasks: TenantRepo<PrintTask>;
  private readonly orders: TenantRepo<Order>;
  private readonly items: TenantRepo<OrderItem>;
  private readonly stores: TenantRepo<Store>;
  private readonly printers: TenantRepo<Printer>;

  constructor(
    @InjectRepository(PrintTask) taskRepository: Repository<PrintTask>,
    @InjectRepository(Order) orderRepository: Repository<Order>,
    @InjectRepository(OrderItem) itemRepository: Repository<OrderItem>,
    @InjectRepository(Store) storeRepository: Repository<Store>,
    @InjectRepository(Printer) printerRepository: Repository<Printer>,
    private readonly printerService: PrinterService,
    // 这两个是值导入的注入类：写 import type 能过编译，但启动时才报 can't resolve dependency
    private readonly printProviderConfigs: PrintProviderConfigService,
    private readonly cloudProviders: CloudPrintProviderRegistry,
  ) {
    this.tasks = new TenantRepo(taskRepository);
    this.orders = new TenantRepo(orderRepository);
    this.items = new TenantRepo(itemRepository);
    this.stores = new TenantRepo(storeRepository);
    this.printers = new TenantRepo(printerRepository);
  }

  /* ------------------------------ 小票数据 ------------------------------ */

  /**
   * 组装一张小票要打的全部内容。
   *
   * `ticketType=kitchen` 时金额一律置 0 且 `showAmount=false`：
   * 后厨小票上出现钱是收银事故，这个判断放后端而不是让前端「记得别显示」。
   */
  async buildReceipt(
    merchantId: number,
    orderId: number,
    ticketType: PrintTicketType = PrintTicketType.Customer,
  ): Promise<ReceiptData> {
    const order = await this.orders.findById(merchantId, orderId);
    const store = await this.stores.findBy(merchantId, {});
    const items = await this.items.list(merchantId, {
      where: { orderId } as FindOptionsWhere<OrderItem>,
      order: { id: 'ASC' },
    });

    const printer = await this.printerService.pickForTicket(merchantId, ticketType);
    const showAmount = ticketType === PrintTicketType.Customer;
    const copies = printer?.copies ?? (showAmount ? (store?.customerCopies ?? 1) : 1);

    const lines: ReceiptLine[] = items.map((item) => ({
      dishName: item.dishName,
      specDesc: item.specDesc ?? '',
      quantity: item.quantity,
      unitPriceCents: toCents(item.unitPrice),
      totalCents: toCents(item.totalAmount),
      remark: item.remark ?? '',
    }));

    const shopName = store?.name ?? '门店';
    const address = [store?.province, store?.city, store?.district, store?.address]
      .filter((part): part is string => Boolean(part))
      .join('');

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      pickupCode: order.pickupCode ?? '',
      ticketType,
      shop: {
        name: shopName,
        phone: store?.phone ?? '',
        address,
        logo: store?.logo ?? '',
      },
      dineTypeLabel: DINE_TYPE_LABELS[order.dineType],
      tableNo: order.tableNo ?? '',
      peopleCount: order.peopleCount,
      memberNickname: order.memberNickname ?? '',
      remark: order.remark ?? '',
      orderedAt: order.createdAt.toISOString(),
      printedAt: new Date().toISOString(),
      lines,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      copies: Math.min(Math.max(copies, 1), PRINT_MAX_COPIES),
      paperSize: printer?.paperSize ?? '80mm',
      amount: showAmount
        ? {
            dishCents: toCents(order.dishAmount),
            packingCents: toCents(order.packingAmount),
            deliveryCents: toCents(order.deliveryAmount),
            discountCents: toCents(order.discountAmount),
            payCents: toCents(order.payAmount),
          }
        : {
            dishCents: 0,
            packingCents: 0,
            deliveryCents: 0,
            discountCents: 0,
            payCents: 0,
          },
      showAmount,
      footer: receiptFooter(shopName),
    };
  }

  /* ------------------------------ 打印任务 ------------------------------ */

  /**
   * 建一条打印任务。
   *
   * 无论 browser 还是 cloud 都先落 `pending` 再返回：
   * 出纸是异步的（前端渲染打印 / 厂商网关排队），同步等结果只会阻塞收银台。
   *
   * 两种情况分道扬镳：
   * - `browser`：交给前端渲染打印，打完回执改状态；
   * - `cloud`：**这里就真的把票推给厂商网关**，网关受理即 `success`，
   *   被拒或网络不通即 `failed` 并带上可照做的原因。
   *
   * 云模式为什么不让调用方去推：推单需要厂商凭据，而凭据只在平台侧；
   * 更要紧的是「谁负责改任务状态」必须唯一 —— 两边都能改就会出现
   * 已经出纸了但流水还是 pending 的脏数据。
   */
  async createTask(
    merchantId: number,
    dto: CreatePrintTaskDto,
    operator: { id: number | null; name: string | null },
  ): Promise<PrintTaskItem> {
    const ticketType = dto.ticketType ?? PrintTicketType.Customer;
    const order = await this.orders.findById(merchantId, dto.orderId);

    let printer: Printer | null = null;
    if (dto.printerId) {
      printer = await this.printers.findById(merchantId, dto.printerId);
      if (printer.status !== AccountStatus.Active) {
        throw BusinessException.badRequest(`打印机「${printer.name}」已停用`);
      }
    } else {
      printer = await this.printerService.pickForTicket(merchantId, ticketType);
    }

    const copies = Math.min(
      Math.max(dto.copies ?? printer?.copies ?? 1, 1),
      PRINT_MAX_COPIES,
    );

    const task = await this.tasks.create(merchantId, {
      orderId: order.id,
      orderNo: order.orderNo,
      ticketType,
      mode: printer?.mode ?? PrintMode.Browser,
      printerName: printer?.name ?? null,
      copies,
      status: PrintTaskStatus.Pending,
      retryCount: 0,
      failReason: null,
      trigger: dto.trigger ?? 'manual',
      operatorId: operator.id,
      operatorName: operator.name,
      printedAt: null,
    });

    if (printer?.mode === PrintMode.Cloud && printer.provider && printer.deviceNo) {
      return this.dispatchToCloud(merchantId, task, printer, ticketType);
    }

    return task;
  }

  /**
   * 把票推给云打印机网关，并按结果收口任务状态。
   *
   * 推单失败**不抛异常**：任务已落库，抛出去只会让收银台看到一个报错弹窗，
   * 而流水里那条 `failed` 才是商家真正要的 —— 他可以在打印流水里点重试。
   * 唯一例外是「厂商没配好」，那种情况重试多少次都没用，直接把它变成任务失败原因。
   */
  private async dispatchToCloud(
    merchantId: number,
    task: PrintTaskItem,
    printer: Printer,
    ticketType: PrintTicketType,
  ): Promise<PrintTaskItem> {
    const provider = printer.provider as PrintProvider | null;
    const label = provider ? (PRINT_PROVIDER_LABELS[provider] ?? provider) : '云打印机';

    let failReason: string | null = null;
    try {
      const effective = await this.printProviderConfigs.getEffective(provider as PrintProvider);
      const instance = this.cloudProviders.requireReady(provider as string, effective);
      const receipt = await this.buildReceipt(merchantId, task.orderId, ticketType);

      const result = await instance.print({
        config: effective,
        deviceNo: printer.deviceNo as string,
        copies: task.copies,
        // 用本地任务 ID 当幂等键：重试带同一个 id，网关不会重复出纸
        originId: `${task.id}`,
        receipt,
      });
      failReason = result.accepted ? null : (result.failureReason ?? '厂商网关拒绝受理');
    } catch (error) {
      failReason = error instanceof Error ? error.message : String(error);
    }

    if (failReason === null) {
      return this.tasks.update(merchantId, task.id, {
        status: PrintTaskStatus.Success,
        failReason: null,
        printedAt: new Date(),
      });
    }

    this.logger.warn(`云打印失败 task=${task.id} printer=${printer.name}: ${failReason}`);
    return this.tasks.update(merchantId, task.id, {
      status: PrintTaskStatus.Failed,
      failReason: failReason.slice(0, 255),
      printedAt: null,
    });
  }

  /** 前端出纸后回执；cloud 模式由后端推单时收口，两者共用这一个入口。 */
  async reportTask(
    merchantId: number,
    id: number,
    dto: ReportPrintTaskDto,
  ): Promise<PrintTaskItem> {
    const task = await this.tasks.findById(merchantId, id);
    const success = dto.status === PrintTaskStatus.Success;

    return this.tasks.update(merchantId, id, {
      status: dto.status,
      failReason: success ? null : (dto.failReason ?? '未知原因'),
      printedAt: success ? new Date() : task.printedAt,
    });
  }

  /**
   * 失败重试：不新建任务，在原任务上累加 `retryCount`。
   *
   * 这样「这一单到底打了几次」在流水里是一条记录、一个计数，
   * 而不是散成好几行需要自己数。
   *
   * 云打印机的重试在这里就直接重推 —— 让商家点一下就有结果，
   * 而不是"重置成 pending 等着谁去发现"。
   */
  async retryTask(
    merchantId: number,
    id: number,
    operator: { id: number | null; name: string | null },
  ): Promise<PrintTaskItem> {
    const task = await this.tasks.findById(merchantId, id);
    if (task.status !== PrintTaskStatus.Failed) {
      throw BusinessException.badRequest('只有打印失败的任务才能重试');
    }
    if (task.retryCount >= PRINT_MAX_RETRY) {
      throw BusinessException.badRequest(
        `重试次数已达上限（${PRINT_MAX_RETRY} 次），请检查打印机后再试`,
      );
    }

    const reset = await this.tasks.update(merchantId, id, {
      status: PrintTaskStatus.Pending,
      retryCount: task.retryCount + 1,
      failReason: null,
      trigger: 'retry',
      operatorId: operator.id,
      operatorName: operator.name,
    });

    if (task.mode !== PrintMode.Cloud) {
      return reset;
    }

    // 打印机可能已经被删掉，那种情况下只能维持 pending 并说明原因
    const printer = await this.findPrinterForRetry(merchantId, task);
    if (!printer?.provider || !printer.deviceNo) {
      return this.tasks.update(merchantId, id, {
        status: PrintTaskStatus.Failed,
        failReason: '原云打印机已删除或未配置设备号，请在「打印设置」中重新配置后打印新票',
      });
    }

    return this.dispatchToCloud(merchantId, reset, printer, task.ticketType);
  }

  /** 重试时按名字找原打印机：任务流水里存的是名称快照，没有 printerId。 */
  private async findPrinterForRetry(
    merchantId: number,
    task: PrintTaskItem,
  ): Promise<Printer | null> {
    if (!task.printerName) {
      return null;
    }
    return this.printers.findBy(merchantId, {
      name: task.printerName,
    } as FindOptionsWhere<Printer>);
  }

  async pageTasks(
    merchantId: number,
    query: PrintTaskQueryDto,
  ): Promise<PageResult<PrintTaskItem>> {
    const where: FindOptionsWhere<PrintTask> = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.ticketType) {
      where.ticketType = query.ticketType;
    }
    if (query.orderNo) {
      where.orderNo = Like(likePattern(query.orderNo));
    }
    if (query.keyword) {
      where.printerName = Like(likePattern(query.keyword));
    }
    if (query.from && query.to) {
      where.createdAt = Between(startOfDay(query.from), endOfDay(query.to));
    } else if (query.from) {
      where.createdAt = MoreThanOrEqual(startOfDay(query.from));
    } else if (query.to) {
      where.createdAt = LessThanOrEqual(endOfDay(query.to));
    }

    return this.tasks.page(merchantId, query, { where, order: { id: 'DESC' } });
  }

  /**
   * 某个订单的打印流水，供订单详情抽屉按单展示「已打几张小票、有没有失败」。
   */
  async listTasksByOrder(merchantId: number, orderId: number): Promise<PrintTaskItem[]> {
    await this.orders.findById(merchantId, orderId);
    return this.tasks.list(merchantId, {
      where: { orderId } as FindOptionsWhere<PrintTask>,
      order: { id: 'DESC' },
    });
  }

  /**
   * 出餐自动打印：在订单状态推进到门店配置的时机时调用。
   *
   * 返回 null 表示不需要打印（未开启自动打印 / 该票种没配打印机），
   * 调用方不需要处理异常，打印失败也不应影响订单流转 —— 打不出票是硬件问题，
   * 不能让订单卡在「已接单」。
   */
  async autoPrintForOrder(
    merchantId: number,
    orderId: number,
    on: string,
  ): Promise<PrintTaskItem | null> {
    const store = await this.stores.findBy(merchantId, {});
    if (!store?.autoPrint || store.autoPrintOn !== on) {
      return null;
    }

    const ticketTypes: PrintTicketType[] = [
      PrintTicketType.Customer,
      PrintTicketType.Kitchen,
    ];
    const enabled = await this.printers.list(merchantId, {
      where: {
        status: AccountStatus.Active,
        ticketType: In(ticketTypes),
      } as FindOptionsWhere<Printer>,
    });
    if (enabled.length === 0) {
      return null;
    }

    // 顾客小票优先：先给顾客那台建任务，后厨那台失败也不影响顾客拿到票
    const target =
      enabled.find((printer) => printer.ticketType === PrintTicketType.Customer) ??
      enabled[0]!;

    return this.createTask(
      merchantId,
      { orderId, ticketType: target.ticketType, trigger: 'auto' },
      { id: null, name: null },
    );
  }
}
