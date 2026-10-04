import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/auth.decorators';
import {
  CurrentUser,
  MerchantId,
} from '../../../common/decorators/current-user.decorator';
import { AuditContext } from '../../../common/decorators/audit-actor.decorator';
import { Permission } from '../../../common/constants/permission';
import type { AuditActor } from '../../../common/models/audit-context';
import {
  AuditAction,
  AuditTargetType,
} from '../../audit/constants/audit-action';
import { AuditService } from '../../audit/audit.service';
import {
  CHANNEL_LABELS,
  MerchantPaymentStatus,
  type MerchantPaymentConfigItem,
} from '../../payment/models/payment-config.model';
import { PaymentChannel, OFFLINE_CHANNELS } from '../../payment/constants/payment.constant';
import { PaymentConfigService } from '../../payment/payment-config.service';
import { CashierMemberService } from './cashier-member.service';
import { CashierOrderService } from './cashier-order.service';
import { CreateCashierOrderDto, LookupMemberQueryDto } from './dto/cashier.dto';
import type {
  CashierMemberView,
  CashierOrderView,
  CashierPaymentMethod,
  CashierPreviewView,
} from './models/cashier.model';

/**
 * 收银台（CM-web）。
 *
 * 权限刻意分成三层，而不是一个 `cashier:use` 走天下：
 * - `cashier:use`：能不能进收银台（登录闸门 + 本组接口）；
 * - `order:create`：能不能替顾客开单；
 * - `member:lookup`：能不能查会员。
 *
 * 这样「只让收银员看收款方式但不许开单」这类诉求不用改代码。
 * 结账本身不在这里 —— 它复用支付域的 `POST /merchant/payments`，
 * 收银台不另写一套收款逻辑。
 */
@ApiTags('商家端-收银台')
@Controller('merchant/cashier')
export class CashierController {
  constructor(
    private readonly members: CashierMemberService,
    private readonly orders: CashierOrderService,
    private readonly paymentConfigs: PaymentConfigService,
    private readonly audit: AuditService,
  ) {}

  @Get('payment-methods')
  @Permissions(Permission.CashierUse)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '本店可用的收款方式：线下渠道恒可用，在线渠道按开通情况给出原因' })
  async paymentMethods(@MerchantId() merchantId: number): Promise<CashierPaymentMethod[]> {
    const methods: CashierPaymentMethod[] = OFFLINE_CHANNELS.map((channel) => ({
      channel,
      label: CHANNEL_LABELS[channel],
      available: true,
      reason: null,
      needChange: channel === PaymentChannel.Cash,
    }));

    const online = await this.paymentConfigs.listForMerchant(merchantId);
    for (const item of online) {
      const available = item.status === MerchantPaymentStatus.Enabled && item.channelOpen;
      methods.push({
        channel: item.channel,
        label: item.channelLabel,
        available,
        reason: available ? null : this.explainUnavailable(item),
        needChange: false,
      });
    }
    return methods;
  }

  @Get('members/lookup')
  @Permissions(Permission.MemberLookup)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '按手机号认会员；查不到返回 null，不是本店会员时带提示' })
  lookupMember(
    @MerchantId() merchantId: number,
    @Query() query: LookupMemberQueryDto,
  ): Promise<CashierMemberView | null> {
    return this.members.lookup(merchantId, query.phone);
  }

  @Post('orders/preview')
  @Permissions(Permission.OrderCreate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '下单前算价：金额由后端算，不落库不扣库存' })
  previewOrder(
    @MerchantId() merchantId: number,
    @Body() dto: CreateCashierOrderDto,
  ): Promise<CashierPreviewView> {
    return this.orders.preview(merchantId, dto);
  }

  @Post('orders')
  @Permissions(Permission.OrderCreate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '线下点餐建单：金额由后端算，堂食自动开台，初始状态为已接单' })
  async createOrder(
    @MerchantId() merchantId: number,
    @Body() dto: CreateCashierOrderDto,
    @AuditContext() actor: AuditActor,
    @CurrentUser('id') operatorId: number,
    @CurrentUser('realName') operatorName: string,
  ): Promise<CashierOrderView> {
    const order = await this.orders.create(merchantId, dto, {
      id: operatorId,
      name: operatorName,
    });
    await this.audit.record(actor, {
      action: AuditAction.CashierOrderCreate,
      targetType: AuditTargetType.Order,
      targetId: order.id,
      targetName: order.orderNo,
      detail: {
        dineType: order.dineType,
        tableNo: order.tableNo,
        memberId: order.memberId,
        payAmount: order.payAmount,
      },
    });
    return order;
  }

  /** 把「为什么这个渠道不可用」翻成收银员能照做的一句话。 */
  private explainUnavailable(item: MerchantPaymentConfigItem): string {
    if (!item.channelOpen) {
      return `${item.channelLabel}渠道已被平台关闭，请联系平台运营`;
    }
    switch (item.status) {
      case MerchantPaymentStatus.NotApplied:
        return `${item.channelLabel}尚未开通，请先在商家端「收款设置」提交进件资料`;
      case MerchantPaymentStatus.PendingAudit:
        return `${item.channelLabel}进件资料审核中，暂时无法收款`;
      case MerchantPaymentStatus.Rejected:
        return `${item.channelLabel}进件被驳回：${item.auditRemark ?? '请联系平台了解详情'}`;
      case MerchantPaymentStatus.Disabled:
        return `${item.channelLabel}已被平台停用`;
      default:
        return `${item.channelLabel}暂不可用`;
    }
  }
}
