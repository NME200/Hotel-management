import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditContext } from '../../common/decorators/audit-actor.decorator';
import { Permissions } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/constants/permission';
import { BusinessException } from '../../common/exceptions/business.exception';
import type { AuditActor } from '../../common/models/audit-context';
import { AuditAction, AuditTargetType } from '../audit/constants/audit-action';
import { AuditService } from '../audit/audit.service';
import { PaymentChannel } from './constants/payment.constant';
import { UpdateChannelConfigDto } from './dto/payment-config.dto';
import type { PaymentChannelItem } from './models/payment-config.model';
import { PaymentConfigService } from './payment-config.service';

@ApiTags('平台端-支付渠道配置')
@Controller('platform/payment-channels')
export class PlatformPaymentChannelController {
  constructor(
    private readonly configService: PaymentConfigService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Permissions(Permission.PlatformPaymentManage)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '渠道配置列表（密钥只回掩码与指纹）' })
  list(): Promise<PaymentChannelItem[]> {
    return this.configService.listChannels();
  }

  @Put(':channel')
  @Permissions(Permission.PlatformPaymentManage)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '保存渠道配置；密钥传回掩码即表示不修改' })
  async update(
    @Param('channel') channel: string,
    @Body() dto: UpdateChannelConfigDto,
    @AuditContext() actor: AuditActor,
    @CurrentUser('id') operatorId: number,
    @CurrentUser('realName') operatorName: string,
  ): Promise<PaymentChannelItem> {
    const parsed = this.parseChannel(channel);
    const result = await this.configService.updateChannel(parsed, dto, {
      id: operatorId,
      name: operatorName,
    });

    // 审计只记改了哪些字段名，绝不记密钥值
    await this.audit.record(actor, {
      action: AuditAction.PaymentChannelUpdate,
      targetType: AuditTargetType.PaymentChannel,
      targetName: result.label,
      detail: {
        fields: Object.keys(dto).filter((key) => key !== 'secrets'),
        secretFieldsTouched: Object.keys(dto.secrets ?? {}),
        enabled: result.enabled,
      },
    });
    return result;
  }

  @Post(':channel/test')
  @Permissions(Permission.PlatformPaymentManage)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '渠道配置自检' })
  test(@Param('channel') channel: string): Promise<{ ok: boolean; message: string; checkedAt: Date }> {
    return this.configService.testChannel(this.parseChannel(channel));
  }

  private parseChannel(value: string): PaymentChannel {
    const channels: string[] = Object.values(PaymentChannel);
    if (!channels.includes(value)) {
      throw BusinessException.badRequest(`未知支付渠道: ${value}`);
    }
    return value as PaymentChannel;
  }
}
