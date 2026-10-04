import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { In, Not, type FindOptionsWhere, type Repository } from 'typeorm';
import {
  AccountStatus,
  OrderStatus,
  PayStatus,
  TableDiningStatus,
} from '../../../common/constants/dict';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { Order } from '../../../database/entities/order.entity';
import { StoreTable } from '../../../database/entities/store-table.entity';
import { WechatMiniService } from '../../client/wechat/wechat-mini.service';
import { UploadService } from '../upload/upload.service';
import {
  type BatchCreateResult,
  type BatchCreateTablesDto,
  type CreateTableDto,
  type TableItem,
  type UpdateTableDto,
} from './dto/table.dto';

/**
 * 桌位管理：一张桌子一条记录，保存时生成专属小程序码。
 *
 * 两条关键规则，改代码时不要动摇：
 * 1. **二维码里放的是 `qr_token`，不是桌号**。所以改桌号不用重印码，
 *    顾客也没法自己拼一个 scene 把订单下到别桌。
 * 2. **制码失败不阻塞建桌**。微信凭据没配、小程序没发布都会让制码失败，
 *    这时桌位照样建出来（`qrCodeUrl` 为空），商家稍后点「重新生成」即可；
 *    只有「重新生成」这个显式动作才会把失败抛给前端看。
 */
@Injectable()
export class TableService {
  private readonly logger = new Logger(TableService.name);
  private readonly tables: TenantRepo<StoreTable>;
  private readonly orders: TenantRepo<Order>;

  constructor(
    @InjectRepository(StoreTable) private readonly repository: Repository<StoreTable>,
    @InjectRepository(Order) orderRepository: Repository<Order>,
    private readonly wechat: WechatMiniService,
    private readonly uploads: UploadService,
  ) {
    this.tables = new TenantRepo(repository);
    this.orders = new TenantRepo(orderRepository);
  }

  async list(merchantId: number): Promise<TableItem[]> {
    return this.tables.list(merchantId, { order: { sort: 'ASC', id: 'ASC' } });
  }

  async findById(merchantId: number, id: number): Promise<TableItem> {
    return this.tables.findById(merchantId, id);
  }

  async create(merchantId: number, dto: CreateTableDto): Promise<TableItem> {
    await this.assertTableNoFree(merchantId, dto.tableNo, null);

    const created = await this.tables.create(merchantId, {
      tableNo: dto.tableNo,
      qrToken: newQrToken(),
      qrCodeUrl: null,
      area: dto.area ?? null,
      seats: dto.seats ?? null,
      status: AccountStatus.Active,
      sort: dto.sort ?? 0,
    });
    await this.tryGenerateQrCode(created);
    return created;
  }

  /**
   * 批量建桌：`前缀 + 序号`，重名的桌号跳过而不是整批失败。
   * 一家店 30 张桌逐个点太反人类，但整批回滚又会让人搞不清到底建了几张。
   */
  async createBatch(merchantId: number, dto: BatchCreateTablesDto): Promise<BatchCreateResult> {
    const prefix = dto.prefix ?? '';
    const padLength = dto.padLength ?? 2;
    const wanted: string[] = [];
    for (let index = 0; index < dto.count; index += 1) {
      wanted.push(`${prefix}${String(dto.startNo + index).padStart(padLength, '0')}`);
    }

    const existing = await this.tables.list(merchantId, {
      where: { tableNo: In(wanted) } as FindOptionsWhere<StoreTable>,
      select: { tableNo: true },
    });
    const taken = new Set(existing.map((row) => row.tableNo));
    const fresh = wanted.filter((tableNo) => !taken.has(tableNo));
    const skipped = wanted.filter((tableNo) => taken.has(tableNo));

    if (!fresh.length) {
      throw BusinessException.conflict('这些桌号都已存在，请调整起始序号或前缀');
    }

    const created = await this.tables.createMany(
      merchantId,
      fresh.map((tableNo) => ({
        tableNo,
        qrToken: newQrToken(),
        qrCodeUrl: null,
        area: dto.area ?? null,
        seats: dto.seats ?? null,
        status: AccountStatus.Active,
        sort: dto.startNo,
      })),
    );

    // 逐个制码：微信接口有频次限制，串行且失败只 warn，不因为第 3 张失败就丢掉后 27 张
    for (const table of created) {
      await this.tryGenerateQrCode(table);
    }

    return { created, skipped };
  }

  async update(merchantId: number, id: number, dto: UpdateTableDto): Promise<TableItem> {
    const current = await this.tables.findById(merchantId, id);
    if (dto.tableNo !== current.tableNo) {
      await this.assertTableNoFree(merchantId, dto.tableNo, id);
    }

    // 桌号可以随便改，qr_token 不动：已贴出去的码继续有效，这正是用 token 而非桌号的原因
    return this.tables.update(merchantId, id, {
      tableNo: dto.tableNo,
      area: dto.area ?? null,
      seats: dto.seats ?? null,
      sort: dto.sort ?? current.sort,
      status: dto.status,
    });
  }

  async updateStatus(
    merchantId: number,
    id: number,
    status: AccountStatus,
  ): Promise<TableItem> {
    return this.tables.update(merchantId, id, { status });
  }

  async remove(merchantId: number, id: number): Promise<void> {
    await this.tables.remove(merchantId, id);
  }

  /* ------------------------------ 开台 / 清台 ------------------------------ */

  /**
   * 开台：把桌位置为「用餐中」并登记人数与开台时间。
   *
   * 开台本身不建订单 —— 顾客可能先坐下再点菜。订单在之后由收银台下单时带上桌号，
   * 两者靠 `table_no` 关联，因此这里不需要（也不该）持有订单 ID：
   * 一桌可以先后下多单（加菜），绑死一个订单反而表达不了。
   */
  async openTable(
    merchantId: number,
    id: number,
    guestCount?: number | null,
  ): Promise<TableItem> {
    const table = await this.tables.findById(merchantId, id);
    if (table.status !== AccountStatus.Active) {
      throw BusinessException.badRequest(`「${table.tableNo}」已停用，无法开台`);
    }
    if (table.diningStatus === TableDiningStatus.Dining) {
      throw BusinessException.conflict(`「${table.tableNo}」已在用餐中，无需重复开台`);
    }

    return this.tables.update(merchantId, id, {
      diningStatus: TableDiningStatus.Dining,
      guestCount: guestCount ?? null,
      openedAt: new Date(),
    });
  }

  /**
   * 清台：把桌位置回空闲。
   *
   * 默认拦一道「桌上还有未结账的订单」—— 清完台再想不起这桌吃了什么是收银台最常见的
   * 丢账方式。顾客跑单这类真实情况用 `force` 显式绕过，而不是把校验做成软提示。
   */
  async closeTable(
    merchantId: number,
    id: number,
    force = false,
  ): Promise<TableItem> {
    const table = await this.tables.findById(merchantId, id);
    if (table.diningStatus !== TableDiningStatus.Dining) {
      throw BusinessException.conflict(`「${table.tableNo}」当前是空闲状态，无需清台`);
    }

    if (!force) {
      const unpaid = await this.orders.count(merchantId, {
        tableNo: table.tableNo,
        payStatus: PayStatus.Unpaid,
        status: Not(OrderStatus.Cancelled),
      } as FindOptionsWhere<Order>);
      if (unpaid > 0) {
        throw BusinessException.conflict(
          `「${table.tableNo}」还有 ${unpaid} 笔未结账的订单，请先结账；确需清台请选择强制清台`,
        );
      }
    }

    return this.tables.update(merchantId, id, {
      diningStatus: TableDiningStatus.Idle,
      guestCount: null,
      openedAt: null,
    });
  }

  /**
   * 重新生成二维码：换一个 `qr_token`，等于把已经贴出去的旧码作废。
   *
   * 先生成、成功后再落库。反过来（先换 token 再制码）会出现
   * 「旧码已作废、新码没生成」的空窗，商家桌上的码当场变成废纸。
   */
  async regenerateQrCode(merchantId: number, id: number): Promise<TableItem> {
    const table = await this.tables.findById(merchantId, id);
    const token = newQrToken();
    const png = await this.wechat.getUnlimitedQrCode(token);
    const stored = await this.uploads.saveGeneratedImage(png, 'png');

    table.qrToken = token;
    table.qrCodeUrl = stored.url;
    return this.tables.persist(table);
  }

  /** 制码失败只记日志：桌位本身可用，商家可在列表里重试。 */
  private async tryGenerateQrCode(table: StoreTable): Promise<void> {
    try {
      const png = await this.wechat.getUnlimitedQrCode(table.qrToken);
      const stored = await this.uploads.saveGeneratedImage(png, 'png');
      table.qrCodeUrl = stored.url;
      await this.tables.persist(table);
    } catch (error) {
      this.logger.warn(
        `桌位「${table.tableNo}」小程序码生成失败（merchantId=${table.merchantId}）：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async assertTableNoFree(
    merchantId: number,
    tableNo: string,
    excludeId: number | null,
  ): Promise<void> {
    const existing = await this.tables.findBy(merchantId, {
      tableNo,
    } as FindOptionsWhere<StoreTable>);
    if (existing && existing.id !== excludeId) {
      throw BusinessException.conflict(`已存在桌号「${tableNo}」`);
    }
  }
}

/**
 * 扫码令牌：16 位 base64url 随机串（约 96 bit 熵），全局唯一。
 * 只含 `A-Za-z0-9-_`，正好落在微信 scene 允许的字符集内，也短到不占 scene 的 32 字上限。
 */
function newQrToken(): string {
  return randomBytes(12).toString('base64url');
}
