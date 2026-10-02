import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/auth.decorators';
import { Permission } from '../../common/constants/permission';
import type { PageResult } from '../../common/dto/page-result.dto';
import {
  PlatformPaymentQueryDto,
  PlatformRefundQueryDto,
} from './dto/platform-payment-query.dto';
import type {
  PlatformPaymentItem,
  PlatformPaymentSummary,
  PlatformRefundItem,
} from './models/platform-payment.model';
import { PlatformPaymentService } from './platform-payment.service';

/**
 * 平台端支付流水。纯只读：平台看得到全平台的钱，但不经手任何一笔——
 * 发起收款与退款仍然只在商家端，这样责任边界清晰。
 */
@ApiTags('平台端-支付流水')
@Controller('platform/payments')
@Permissions(Permission.PlatformPaymentRead)
@ApiBearerAuth('bearer')
export class PlatformPaymentController {
  constructor(private readonly paymentService: PlatformPaymentService) {}

  @Get()
  @ApiOperation({ summary: '全平台支付流水分页，可按商户/渠道/状态/日期/订单号筛选' })
  page(@Query() query: PlatformPaymentQueryDto): Promise<PageResult<PlatformPaymentItem>> {
    return this.paymentService.page(query);
  }

  @Get('summary')
  @ApiOperation({ summary: '支付概况：累计与今日交易额、退款、未完成与异常笔数' })
  summary(): Promise<PlatformPaymentSummary> {
    return this.paymentService.summary();
  }

  @Get('refunds')
  @ApiOperation({ summary: '全平台退款流水分页' })
  refunds(@Query() query: PlatformRefundQueryDto): Promise<PageResult<PlatformRefundItem>> {
    return this.paymentService.refundPage(query);
  }

  @Get(':paymentNo')
  @ApiOperation({ summary: '支付单详情（含商户与订单号）' })
  detail(@Param('paymentNo') paymentNo: string): Promise<PlatformPaymentItem> {
    return this.paymentService.detail(paymentNo);
  }

  @Get(':paymentNo/notifies')
  @ApiOperation({ summary: '该支付单收到的渠道通知原始记录，排障用' })
  notifies(@Param('paymentNo') paymentNo: string): Promise<Record<string, unknown>[]> {
    return this.paymentService.notifies(paymentNo);
  }
}
