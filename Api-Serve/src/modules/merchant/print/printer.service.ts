import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type FindOptionsWhere, type Repository } from 'typeorm';
import { AccountStatus, PrintMode, PrintTicketType } from '../../../common/constants/dict';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { Printer } from '../../../database/entities/printer.entity';
import {
  type CreatePrinterDto,
  type PrinterItem,
  type UpdatePrinterDto,
} from './dto/print.dto';

/**
 * 打印机配置：一个商户支持多台（前台打顾客小票、后厨打后厨小票）。
 *
 * 云打印机模式下，`provider` + `deviceNo` 必须成对出现：
 * 只填设备号不知道推给哪家网关，只填网关不知道推给哪台机器，
 * 这种配置错误不会立刻报错，而是等到真实出单时才失败 —— 所以在这里挡掉。
 */
@Injectable()
export class PrinterService {
  private readonly printers: TenantRepo<Printer>;

  constructor(@InjectRepository(Printer) repository: Repository<Printer>) {
    this.printers = new TenantRepo(repository);
  }

  async list(merchantId: number): Promise<PrinterItem[]> {
    return this.printers.list(merchantId, { order: { id: 'DESC' } });
  }

  async findById(merchantId: number, id: number): Promise<PrinterItem> {
    return this.printers.findById(merchantId, id);
  }

  async create(merchantId: number, dto: CreatePrinterDto): Promise<PrinterItem> {
    this.assertCloudCredential(dto.mode, dto.provider, dto.deviceNo);
    await this.assertNameFree(merchantId, dto.name, null);

    return this.printers.create(merchantId, {
      name: dto.name,
      mode: dto.mode,
      ticketType: dto.ticketType,
      paperSize: dto.paperSize,
      copies: dto.copies,
      provider: dto.provider ?? null,
      deviceNo: dto.deviceNo ?? null,
      remark: dto.remark ?? null,
      status: AccountStatus.Active,
    });
  }

  async update(
    merchantId: number,
    id: number,
    dto: UpdatePrinterDto,
  ): Promise<PrinterItem> {
    const current = await this.printers.findById(merchantId, id);
    this.assertCloudCredential(dto.mode, dto.provider, dto.deviceNo);
    if (dto.name !== current.name) {
      await this.assertNameFree(merchantId, dto.name, id);
    }

    // 切回 browser 模式时清掉云端凭据，避免切换后残留一个用不上的设备号
    const switchingToBrowser = dto.mode === PrintMode.Browser;

    return this.printers.update(merchantId, id, {
      name: dto.name,
      mode: dto.mode,
      ticketType: dto.ticketType,
      paperSize: dto.paperSize,
      copies: dto.copies,
      provider: switchingToBrowser ? null : (dto.provider ?? null),
      deviceNo: switchingToBrowser ? null : (dto.deviceNo ?? null),
      remark: dto.remark ?? null,
      status: dto.status,
    });
  }

  async updateStatus(
    merchantId: number,
    id: number,
    status: AccountStatus,
  ): Promise<PrinterItem> {
    return this.printers.update(merchantId, id, { status });
  }

  async remove(merchantId: number, id: number): Promise<void> {
    await this.printers.remove(merchantId, id);
  }

  /**
   * 按票种挑一台启用中的打印机。同一票种配了多台时取最新配的那台，
   * 不自动「都打一遍」：多台同票种是给不同班次或不同档口准备的，
   * 该打哪台由商家在打印时指定，缺省只挑一台。
   */
  async pickForTicket(
    merchantId: number,
    ticketType: PrintTicketType,
  ): Promise<PrinterItem | null> {
    return this.printers.findBy(
      merchantId,
      {
        ticketType,
        status: AccountStatus.Active,
      } as FindOptionsWhere<Printer>,
      { order: { id: 'DESC' } },
    );
  }

  private assertCloudCredential(
    mode: PrintMode,
    provider: string | null | undefined,
    deviceNo: string | null | undefined,
  ): void {
    if (mode !== PrintMode.Cloud) {
      return;
    }
    if (!provider) {
      throw BusinessException.badRequest('云打印机需要选择厂商');
    }
    if (!deviceNo) {
      throw BusinessException.badRequest('云打印机需要填写设备号（sn）');
    }
  }

  private async assertNameFree(
    merchantId: number,
    name: string,
    excludeId: number | null,
  ): Promise<void> {
    const existing = await this.printers.findBy(merchantId, {
      name,
    } as FindOptionsWhere<Printer>);
    if (existing && existing.id !== excludeId) {
      throw BusinessException.conflict(`已存在同名打印机「${name}」`);
    }
  }
}
