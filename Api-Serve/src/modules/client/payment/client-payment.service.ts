import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { Member } from '../../../database/entities/member.entity';
import { Order } from '../../../database/entities/order.entity';
import { PaymentConfigService } from '../../payment/payment-config.service';
import { PaymentService } from '../../payment/payment.service';
import {
  CHANNEL_LABELS,
  MerchantPaymentStatus,
} from '../../payment/models/payment-config.model';
import type { PaymentView } from '../../payment/models/payment-view.model';
import { PaymentChannel } from '../../payment/constants/payment.constant';
import type { CreateClientPaymentDto } from '../dto/client-payment.dto';

export interface ClientPaymentChannel {
  value: PaymentChannel;
  label: string;
}

/**
 * 顾客自助支付。
 *
 * 这里不重新实现任何支付逻辑：先确认「这张订单是我的」，
 * 再把请求转给商家端同一套 PaymentService——
 * 金额核对、幂等、回调、超时关单因此只有一份实现。
 */
@Injectable()
export class ClientPaymentService {
  private readonly orders: TenantRepo<Order>;
  private readonly members: TenantRepo<Member>;

  constructor(
    @InjectRepository(Order) orderRepository: Repository<Order>,
    @InjectRepository(Member) memberRepository: Repository<Member>,
    private readonly payments: PaymentService,
    private readonly configs: PaymentConfigService,
  ) {
    this.orders = new TenantRepo(orderRepository);
    this.members = new TenantRepo(memberRepository);
  }

  /** 这家店当前真能收钱的渠道：平台渠道总开关 + 商户进件已开通，两道都过才列出来。 */
  async channels(merchantId: number): Promise<ClientPaymentChannel[]> {
    const items = await this.configs.listForMerchant(merchantId);
    return items
      .filter(
        (item) =>
          item.channelOpen &&
          item.status === MerchantPaymentStatus.Enabled &&
          item.channel !== PaymentChannel.Mock,
      )
      .map((item) => ({ value: item.channel, label: CHANNEL_LABELS[item.channel] }));
  }

  async create(
    merchantId: number,
    memberId: number,
    dto: CreateClientPaymentDto,
  ): Promise<PaymentView> {
    const order = await this.requireMyOrder(merchantId, memberId, dto.orderNo);
    if (order.payAmount <= 0) {
      throw BusinessException.badRequest('订单金额为 0，无需支付');
    }

    const payerId = await this.payerOpenid(merchantId, memberId, dto.channel);
    return this.payments.create(merchantId, {
      orderId: order.id,
      channel: dto.channel,
      payerId,
    });
  }

  /** 轮询用：未支付时 PaymentService 会顺带向渠道查一次单，回调丢了也能纠偏。 */
  async detail(
    merchantId: number,
    memberId: number,
    paymentNo: string,
  ): Promise<PaymentView> {
    const view = await this.payments.getByPaymentNo(merchantId, paymentNo);
    const owned = await this.orders.findBy(merchantId, { id: view.orderId, memberId });
    if (!owned) {
      throw BusinessException.forbidden('无权查看该支付单');
    }
    return view;
  }

  async byOrder(
    merchantId: number,
    memberId: number,
    orderNo: string,
  ): Promise<PaymentView | null> {
    const order = await this.requireMyOrder(merchantId, memberId, orderNo);
    return this.payments.getByOrder(merchantId, order.id);
  }

  private async requireMyOrder(
    merchantId: number,
    memberId: number,
    orderNo: string,
  ): Promise<Order> {
    const order = await this.orders.findBy(merchantId, { orderNo, memberId });
    if (!order) {
      throw BusinessException.notFound('订单不存在');
    }
    return order;
  }

  /** 微信 JSAPI 必须有本门店的 openid；拿不到就说明登录态不完整，直接拒绝而不是发一注定失败的单。 */
  private async payerOpenid(
    merchantId: number,
    memberId: number,
    channel: PaymentChannel,
  ): Promise<string | undefined> {
    if (channel !== 'wechat') {
      return undefined;
    }
    const member = await this.members.findById(merchantId, memberId);
    if (!member.openid) {
      throw BusinessException.badRequest('当前登录未完成微信授权，无法使用微信支付');
    }
    return member.openid;
  }
}
