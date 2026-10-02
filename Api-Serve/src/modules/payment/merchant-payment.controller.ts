import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/auth.decorators';
import {
  CurrentUser,
  MerchantId,
} from '../../common/decorators/current-user.decorator';
import { Permission } from '../../common/constants/permission';
import type { PageResult } from '../../common/dto/page-result.dto';
import { CreatePaymentDto, CreateRefundDto } from './dto/payment.dto';
import { PaymentListQueryDto } from './dto/payment-list-query.dto';
import type { PaymentView, RefundView } from './models/payment-view.model';
import { PaymentService } from './payment.service';

/**
 * 商家端支付接口。
 *
 * 发起支付走这里适用于"商家代客收款"（堂食后付、收银台扫码）；
 * 小程序顾客自助下单支付走 client 端接口，随小程序登录一起接入。
 */
@ApiTags('商家端-支付')
@Controller('merchant/payments')
export class MerchantPaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  @Permissions(Permission.PaymentRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '分页查询支付流水' })
  list(
    @MerchantId() merchantId: number,
    @Query() query: PaymentListQueryDto,
  ): Promise<PageResult<PaymentView>> {
    return this.paymentService.list(merchantId, query);
  }

  @Post()
  @Permissions(Permission.PaymentCreate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '为订单发起收款，返回客户端调起支付所需参数' })
  create(
    @MerchantId() merchantId: number,
    @Body() dto: CreatePaymentDto,
  ): Promise<PaymentView> {
    return this.paymentService.create(merchantId, dto);
  }

  @Get(':paymentNo')
  @Permissions(Permission.PaymentRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '查询支付单，未支付时顺带向渠道查单纠偏' })
  detail(
    @MerchantId() merchantId: number,
    @Param('paymentNo') paymentNo: string,
  ): Promise<PaymentView> {
    return this.paymentService.getByPaymentNo(merchantId, paymentNo);
  }

  @Get('order/:orderId')
  @Permissions(Permission.PaymentRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '按订单查询最近一笔支付单' })
  byOrder(
    @MerchantId() merchantId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
  ): Promise<PaymentView | null> {
    return this.paymentService.getByOrder(merchantId, orderId);
  }

  @Post('order/:orderId/refund')
  @Permissions(Permission.PaymentRefund)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '发起退款，不传金额即全额退款' })
  refund(
    @MerchantId() merchantId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: CreateRefundDto,
    @CurrentUser('id') operatorId: number,
    @CurrentUser('realName') operatorName: string,
  ): Promise<RefundView> {
    return this.paymentService.refund(merchantId, orderId, dto, {
      id: operatorId,
      name: operatorName,
    });
  }

  @Get('order/:orderId/refunds')
  @Permissions(Permission.PaymentRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '订单退款记录' })
  refunds(
    @MerchantId() merchantId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
  ): Promise<RefundView[]> {
    return this.paymentService.listRefunds(merchantId, orderId);
  }
}
