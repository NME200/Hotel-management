import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditContext } from '../../common/decorators/audit-actor.decorator';
import { Permissions } from '../../common/decorators/auth.decorators';
import {
  CurrentUser,
  MerchantId,
} from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/constants/permission';
import { BusinessException } from '../../common/exceptions/business.exception';
import type { AuditActor } from '../../common/models/audit-context';
import { AuditAction, AuditTargetType } from '../audit/constants/audit-action';
import { AuditService } from '../audit/audit.service';
import type { PaymentChannel } from './constants/payment.constant';
import { MerchantApplyDto } from './dto/payment-config.dto';
import { CHANNEL_LABELS, type MerchantPaymentConfigItem } from './models/payment-config.model';
import { PaymentConfigService } from './payment-config.service';

@ApiTags('商家端-收款设置')
@Controller('merchant/payment-configs')
export class MerchantPaymentConfigController {
  constructor(
    private readonly configService: PaymentConfigService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Permissions(Permission.PaymentRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '本商户各渠道开通状态与进件进度' })
  list(@MerchantId() merchantId: number): Promise<MerchantPaymentConfigItem[]> {
    return this.configService.listForMerchant(merchantId);
  }

  @Get(':channel')
  @Permissions(Permission.PaymentRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '单个渠道的开通状态' })
  async detail(
    @MerchantId() merchantId: number,
    @Param('channel') channel: string,
  ): Promise<MerchantPaymentConfigItem> {
    const items = await this.configService.listForMerchant(merchantId);
    const matched = items.find((item) => item.channel === channel);
    if (!matched) {
      throw BusinessException.badRequest(`未知支付渠道: ${channel}`);
    }
    return matched;
  }

  @Post('apply')
  @Permissions(Permission.PaymentApply)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '提交进件资料申请开通，提交后进入待审核' })
  async apply(
    @MerchantId() merchantId: number,
    @Body() dto: MerchantApplyDto,
    @AuditContext() actor: AuditActor,
    @CurrentUser('id') operatorId: number,
    @CurrentUser('realName') operatorName: string,
  ): Promise<MerchantPaymentConfigItem> {
    const result = await this.configService.apply(merchantId, dto, {
      id: operatorId,
      name: operatorName,
    });
    await this.audit.record(actor, {
      action: AuditAction.MerchantPaymentApply,
      targetType: AuditTargetType.MerchantPayment,
      targetId: result.id,
      targetName: `${merchantId} / ${CHANNEL_LABELS[dto.channel as PaymentChannel]}`,
      detail: { channel: dto.channel, channelAccount: dto.channelAccount },
    });
    return result;
  }
}
