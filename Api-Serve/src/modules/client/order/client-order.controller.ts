import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PageResult } from '../../../common/dto/page-result.dto';
import {
  ClientMemberId,
  ClientMerchantId,
  ClientSessionGuard,
} from '../guards/client-session.guard';
import { ClientOrderService } from './client-order.service';
import type {
  ClientCheckoutView,
  ClientOrderBriefView,
  ClientOrderTraceView,
} from '../models/client-order.model';
import {
  CancelClientOrderDto,
  ClientCheckoutPreviewDto,
  ClientOrderQueryDto,
  CreateClientOrderDto,
} from '../dto/client-order.dto';

/**
 * 顾客下单与订单跟踪。
 *
 * 结算页与下单是同一个算价入口的两面（一个只算、一个落库），
 * 因此「看到多少钱」和「扣多少钱」不可能对不上。
 */
@ApiTags('顾客端-订单')
@Controller('client/orders')
@UseGuards(ClientSessionGuard)
export class ClientOrderController {
  constructor(private readonly orders: ClientOrderService) {}

  @Post('checkout')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '结算预览：明细、金额构成、本单可用券' })
  checkout(
    @ClientMerchantId() merchantId: number,
    @ClientMemberId() memberId: number,
    @Body() dto: ClientCheckoutPreviewDto,
  ): Promise<ClientCheckoutView> {
    return this.orders.checkout(merchantId, memberId, dto);
  }

  @Post()
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '提交订单，金额全部由后端计算并快照落库' })
  create(
    @ClientMerchantId() merchantId: number,
    @ClientMemberId() memberId: number,
    @Body() dto: CreateClientOrderDto,
  ): Promise<ClientOrderTraceView> {
    return this.orders.create(merchantId, memberId, dto);
  }

  @Get()
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '我的订单列表' })
  list(
    @ClientMerchantId() merchantId: number,
    @ClientMemberId() memberId: number,
    @Query() query: ClientOrderQueryDto,
  ): Promise<PageResult<ClientOrderBriefView>> {
    return this.orders.list(merchantId, memberId, query);
  }

  @Get(':orderNo')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '订单详情与状态跟踪（进度条、取餐码、出餐预估）' })
  detail(
    @ClientMerchantId() merchantId: number,
    @ClientMemberId() memberId: number,
    @Param('orderNo') orderNo: string,
  ): Promise<ClientOrderTraceView> {
    return this.orders.detail(merchantId, memberId, orderNo);
  }

  @Post(':orderNo/cancel')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '取消未接单且未支付的订单，券与库存一并退回' })
  cancel(
    @ClientMerchantId() merchantId: number,
    @ClientMemberId() memberId: number,
    @Param('orderNo') orderNo: string,
    @Body() dto: CancelClientOrderDto,
  ): Promise<ClientOrderTraceView> {
    return this.orders.cancel(merchantId, memberId, orderNo, dto);
  }
}
