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
import { Permissions } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/constants/permission';
import type { PageResult } from '../../common/dto/page-result.dto';
import type { AuditActor } from '../../common/models/audit-context';
import { AuditAction, AuditTargetType } from '../audit/constants/audit-action';
import { AuditService } from '../audit/audit.service';
import {
  MerchantAuditDto,
  MerchantPaymentPageQueryDto,
  SetMerchantPaymentStatusDto,
} from './dto/payment-config.dto';
import {
  MerchantPaymentStatus,
  type MerchantPaymentConfigItem,
  type MerchantPaymentSummary,
} from './models/payment-config.model';
import { PaymentConfigService } from './payment-config.service';

@ApiTags('平台端-商户支付进件')
@Controller('platform/merchant-payment-configs')
export class PlatformMerchantPaymentController {
  constructor(
    private readonly configService: PaymentConfigService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @Permissions(Permission.PlatformMerchantPaymentRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '分页查询商户进件与开通记录' })
  page(
    @Query() query: MerchantPaymentPageQueryDto,
  ): Promise<PageResult<MerchantPaymentConfigItem>> {
    return this.configService.pageForPlatform(query);
  }

  @Get('summary')
  @Permissions(Permission.PlatformMerchantPaymentRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '按状态统计，审核页顶部卡片' })
  summary(): Promise<MerchantPaymentSummary> {
    return this.configService.summary();
  }

  @Get('merchant/:merchantId')
  @Permissions(Permission.PlatformMerchantPaymentRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '某商户三条渠道的完整状态（含未申请）' })
  byMerchant(
    @Param('merchantId', ParseIntPipe) merchantId: number,
  ): Promise<MerchantPaymentConfigItem[]> {
    return this.configService.listForMerchant(merchantId);
  }

  @Post(':id/audit')
  @Permissions(Permission.PlatformMerchantPaymentAudit)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '审核进件：通过即开通，驳回必须给意见' })
  async audit(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MerchantAuditDto,
    @AuditContext() actor: AuditActor,
    @CurrentUser('id') operatorId: number,
    @CurrentUser('realName') operatorName: string,
  ): Promise<MerchantPaymentConfigItem> {
    const result = await this.configService.audit(id, dto, { id: operatorId, name: operatorName });
    await this.auditService.record(actor, {
      action: AuditAction.MerchantPaymentAudit,
      targetType: AuditTargetType.MerchantPayment,
      targetId: id,
      targetName: `${result.merchantName ?? result.merchantId} / ${result.channelLabel}`,
      detail: {
        approved: dto.approved,
        status: result.status,
        feeRate: dto.feeRate ?? null,
        profitShareRate: dto.profitShareRate ?? null,
        auditRemark: dto.auditRemark ?? null,
      },
    });
    return result;
  }

  @Patch(':id/status')
  @Permissions(Permission.PlatformMerchantPaymentAudit)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '启用 / 停用某商户某渠道' })
  async setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetMerchantPaymentStatusDto,
    @AuditContext() actor: AuditActor,
    @CurrentUser('id') operatorId: number,
    @CurrentUser('realName') operatorName: string,
  ): Promise<MerchantPaymentConfigItem> {
    const result = await this.configService.setStatus(
      id,
      dto.status,
      { id: operatorId, name: operatorName },
    );
    await this.auditService.record(actor, {
      action: AuditAction.MerchantPaymentStatus,
      targetType: AuditTargetType.MerchantPayment,
      targetId: id,
      targetName: `${result.merchantName ?? result.merchantId} / ${result.channelLabel}`,
      detail: { status: dto.status },
    });
    return result;
  }
}
