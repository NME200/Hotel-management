import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/auth.decorators';
import { MerchantId } from '../../../common/decorators/current-user.decorator';
import { AuditContext } from '../../../common/decorators/audit-actor.decorator';
import { Permission } from '../../../common/constants/permission';
import type { AccountStatus } from '../../../common/constants/dict';
import type { AuditActor } from '../../../common/models/audit-context';
import {
  AuditAction,
  AuditTargetType,
} from '../../audit/constants/audit-action';
import { AuditService } from '../../audit/audit.service';
import { TableService } from './table.service';
import {
  BatchCreateTablesDto,
  CloseTableDto,
  CreateTableDto,
  OpenTableDto,
  TableStatusDto,
  UpdateTableDto,
  type BatchCreateResult,
  type TableItem,
} from './dto/table.dto';

/**
 * 商家端桌位管理。
 *
 * 权限与打印同构：`table:read` 看桌位与二维码（前台也要看），
 * `table:manage` 才能增删改与重新制码（店长的事）。
 *
 * 「重新生成二维码」是独立动作而不是编辑的一部分：它会换掉 `qr_token`，
 * 让已经贴在桌上的旧码失效，属于必须单独留痕的破坏性操作。
 */
@ApiTags('商家端-桌位管理')
@Controller('merchant/tables')
export class TableController {
  constructor(
    private readonly tables: TableService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Permissions(Permission.TableRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '桌位列表（含小程序码地址）' })
  list(@MerchantId() merchantId: number): Promise<TableItem[]> {
    return this.tables.list(merchantId);
  }

  @Post()
  @Permissions(Permission.TableManage)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '新增桌位，并尝试生成专属小程序码' })
  async create(
    @MerchantId() merchantId: number,
    @Body() dto: CreateTableDto,
    @AuditContext() actor: AuditActor,
  ): Promise<TableItem> {
    const table = await this.tables.create(merchantId, dto);
    await this.audit.record(actor, {
      action: AuditAction.TableCreate,
      targetType: AuditTargetType.Table,
      targetId: table.id,
      targetName: table.tableNo,
      detail: { area: table.area, seats: table.seats },
    });
    return table;
  }

  @Post('batch')
  @Permissions(Permission.TableManage)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '批量建桌：前缀 + 序号，重名自动跳过' })
  async createBatch(
    @MerchantId() merchantId: number,
    @Body() dto: BatchCreateTablesDto,
    @AuditContext() actor: AuditActor,
  ): Promise<BatchCreateResult> {
    const result = await this.tables.createBatch(merchantId, dto);
    await this.audit.record(actor, {
      action: AuditAction.TableCreate,
      targetType: AuditTargetType.Table,
      targetId: 0,
      targetName: `${dto.prefix ?? ''}${dto.startNo} 起 ${dto.count} 张`,
      detail: { created: result.created.length, skipped: result.skipped },
    });
    return result;
  }

  @Patch(':id')
  @Permissions(Permission.TableManage)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '修改桌位（改桌号不会作废已打印的二维码）' })
  async update(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTableDto,
    @AuditContext() actor: AuditActor,
  ): Promise<TableItem> {
    const before = await this.tables.findById(merchantId, id);
    const table = await this.tables.update(merchantId, id, dto);
    await this.audit.record(actor, {
      action: AuditAction.TableUpdate,
      targetType: AuditTargetType.Table,
      targetId: table.id,
      targetName: table.tableNo,
      detail: {
        tableNo: { from: before.tableNo, to: table.tableNo },
        area: { from: before.area, to: table.area },
        seats: { from: before.seats, to: table.seats },
        status: { from: before.status, to: table.status },
      },
    });
    return table;
  }

  @Patch(':id/status')
  @Permissions(Permission.TableManage)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '启用/停用桌位（停用后扫码提示该桌位不可用）' })
  updateStatus(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TableStatusDto,
  ): Promise<TableItem> {
    return this.tables.updateStatus(merchantId, id, dto.status as AccountStatus);
  }

  @Post(':id/qrcode')
  @Permissions(Permission.TableManage)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '重新生成二维码（换 token，旧码立即失效）' })
  async regenerate(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @AuditContext() actor: AuditActor,
  ): Promise<TableItem> {
    const before = await this.tables.findById(merchantId, id);
    const table = await this.tables.regenerateQrCode(merchantId, id);
    await this.audit.record(actor, {
      action: AuditAction.TableQrRegenerate,
      targetType: AuditTargetType.Table,
      targetId: table.id,
      targetName: table.tableNo,
      detail: {
        token: { from: maskToken(before.qrToken), to: maskToken(table.qrToken) },
      },
    });
    return table;
  }

  /* ------------------------------ 开台 / 清台 ------------------------------ */

  @Post(':id/open')
  @Permissions(Permission.TableOperate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '开台：把桌位置为用餐中并登记人数' })
  async open(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: OpenTableDto,
    @AuditContext() actor: AuditActor,
  ): Promise<TableItem> {
    const table = await this.tables.openTable(merchantId, id, dto.guestCount ?? null);
    await this.audit.record(actor, {
      action: AuditAction.TableOpen,
      targetType: AuditTargetType.Table,
      targetId: table.id,
      targetName: table.tableNo,
      detail: { guestCount: table.guestCount },
    });
    return table;
  }

  @Post(':id/close')
  @Permissions(Permission.TableOperate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '清台：置回空闲；桌上有未结账订单时默认拒绝，force=true 可强制' })
  async close(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CloseTableDto,
    @AuditContext() actor: AuditActor,
  ): Promise<TableItem> {
    const before = await this.tables.findById(merchantId, id);
    const table = await this.tables.closeTable(merchantId, id, dto.force ?? false);
    await this.audit.record(actor, {
      action: AuditAction.TableClose,
      targetType: AuditTargetType.Table,
      targetId: table.id,
      targetName: table.tableNo,
      detail: { force: dto.force ?? false, guestCount: before.guestCount },
    });
    return table;
  }

  @Delete(':id')
  @Permissions(Permission.TableManage)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '删除桌位（该桌的二维码同时失效）' })
  async remove(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @AuditContext() actor: AuditActor,
  ): Promise<null> {
    const table = await this.tables.findById(merchantId, id);
    await this.tables.remove(merchantId, id);
    await this.audit.record(actor, {
      action: AuditAction.TableDelete,
      targetType: AuditTargetType.Table,
      targetId: id,
      targetName: table.tableNo,
      detail: { area: table.area },
    });
    return null;
  }
}

/** 审计里只留 token 前后各 4 位：够定位是哪一次重制，又不至于把可用凭据写进审计表。 */
function maskToken(token: string): string {
  return token.length < 8 ? '****' : `${token.slice(0, 4)}…${token.slice(-4)}`;
}
