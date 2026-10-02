import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ClientMemberId,
  ClientMerchantId,
  ClientSessionGuard,
} from '../guards/client-session.guard';
import type { PaymentView } from '../../payment/models/payment-view.model';
import { ClientPaymentService } from './client-payment.service';
import type { ClientPaymentChannel } from './client-payment.service';
import { CreateClientPaymentDto } from '../dto/client-payment.dto';

/**
 * 顾客自助支付：只暴露「我这单能用哪些渠道、发起支付、查单」。
 * 退款不在这里——退款涉及渠道与分账解冻，只能由商家端发起。
 */
@ApiTags('顾客端-支付')
@Controller('client/payments')
@UseGuards(ClientSessionGuard)
export class ClientPaymentController {
  constructor(private readonly payments: ClientPaymentService) {}

  @Get('channels')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '本店当前可收款的渠道' })
  channels(@ClientMerchantId() merchantId: number): Promise<ClientPaymentChannel[]> {
    return this.payments.channels(merchantId);
  }

  @Post()
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '为我的订单发起支付，返回客户端调起参数' })
  create(
    @ClientMerchantId() merchantId: number,
    @ClientMemberId() memberId: number,
    @Body() dto: CreateClientPaymentDto,
  ): Promise<PaymentView> {
    return this.payments.create(merchantId, memberId, dto);
  }

  @Get(':paymentNo')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '查询支付单，未支付时顺带向渠道查单纠偏' })
  detail(
    @ClientMerchantId() merchantId: number,
    @ClientMemberId() memberId: number,
    @Param('paymentNo') paymentNo: string,
  ): Promise<PaymentView> {
    return this.payments.detail(merchantId, memberId, paymentNo);
  }

  @Get('order/:orderNo')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '按订单号查最近一笔支付单' })
  byOrder(
    @ClientMerchantId() merchantId: number,
    @ClientMemberId() memberId: number,
    @Param('orderNo') orderNo: string,
  ): Promise<PaymentView | null> {
    return this.payments.byOrder(merchantId, memberId, orderNo);
  }
}
