import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditContext } from '../../common/decorators/audit-actor.decorator';
import { Permission } from '../../common/constants/permission';
import { Permissions } from '../../common/decorators/auth.decorators';
import type { AuditActor } from '../../common/models/audit-context';
import type { PageResult } from '../../common/dto/page-result.dto';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { ExpiringQueryDto } from './dto/expiring-query.dto';
import { MerchantQueryDto } from './dto/merchant-query.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { UpdateMerchantStatusDto } from './dto/update-merchant-status.dto';
import type {
  ExpiringMerchant,
  MerchantDetail,
  MerchantListItem,
} from './models/merchant-view.model';
import { MerchantService } from './merchant.service';

@ApiTags('平台端-商户管理')
@Controller('platform/merchants')
export class MerchantController {
  constructor(private readonly merchantService: MerchantService) {}

  @ApiBearerAuth('bearer')
  @Permissions(Permission.MerchantRead)
  @Get()
  @ApiOperation({ summary: '分页查询商户列表（含门店名与员工数）' })
  list(@Query() query: MerchantQueryDto): Promise<PageResult<MerchantListItem>> {
    return this.merchantService.page(query);
  }

  /** 必须声明在 :id 之前，否则 expiring 会被当成商户 ID 解析。 */
  @ApiBearerAuth('bearer')
  @Permissions(Permission.MerchantRead)
  @Get('expiring')
  @ApiOperation({ summary: '到期预警列表，days 天内到期（含已过期）' })
  expiring(@Query() query: ExpiringQueryDto): Promise<ExpiringMerchant[]> {
    return this.merchantService.expiring(query.days);
  }

  @ApiBearerAuth('bearer')
  @Permissions(Permission.MerchantRead)
  @Get(':id')
  @ApiOperation({ summary: '商户详情，含门店信息与员工数' })
  detail(@Param('id', ParseIntPipe) id: number): Promise<MerchantDetail> {
    return this.merchantService.detail(id);
  }

  @ApiBearerAuth('bearer')
  @Permissions(Permission.MerchantCreate)
  @Post()
  @ApiOperation({ summary: '开通商户，同时创建管理员账号与默认门店' })
  create(
    @Body() dto: CreateMerchantDto,
    @AuditContext() actor: AuditActor,
  ): Promise<MerchantDetail> {
    return this.merchantService.create(dto, actor);
  }

  @ApiBearerAuth('bearer')
  @Permissions(Permission.MerchantUpdate)
  @Patch(':id')
  @ApiOperation({ summary: '更新商户资料' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMerchantDto,
    @AuditContext() actor: AuditActor,
  ): Promise<MerchantDetail> {
    return this.merchantService.update(id, dto, actor);
  }

  @ApiBearerAuth('bearer')
  @Permissions(Permission.MerchantAudit)
  @Patch(':id/status')
  @ApiOperation({ summary: '变更商户状态（审核通过 / 停用 / 到期 / 重新待审）' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMerchantStatusDto,
    @AuditContext() actor: AuditActor,
  ): Promise<MerchantDetail> {
    return this.merchantService.updateStatus(id, dto, actor);
  }
}
