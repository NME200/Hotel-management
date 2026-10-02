import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/constants/permission';
import { Permissions } from '../../common/decorators/auth.decorators';
import type { PageResult } from '../../common/dto/page-result.dto';
import {
  PlatformReconcileQueryDto,
  RunReconcileDto,
} from './dto/platform-reconcile-query.dto';
import type {
  PlatformReconcileDetail,
  PlatformReconcileItem,
  PlatformReconcileSummary,
  RunReconcileResult,
} from './models/platform-reconcile.model';
import { PlatformReconcileService } from './services/platform-reconcile.service';

/**
 * 平台端交易对账。
 *
 * 唯一的写操作是"手动补跑"——它不是改账，而是让平台**重算**一次本地对渠道的
 * 核对结果。平台始终不修改任何支付/分账数据，账目本身的更正仍然只能由
 * 商家端发起退款、或由渠道侧推动，这条边界不破。
 */
@ApiTags('平台端-交易对账')
@Controller('platform/reconciliations')
@Permissions(Permission.PlatformPaymentRead)
@ApiBearerAuth('bearer')
export class PlatformReconcileController {
  constructor(private readonly service: PlatformReconcileService) {}

  @Get()
  @ApiOperation({ summary: '对账台账分页，可按商户/渠道/状态/对账日筛选' })
  page(@Query() query: PlatformReconcileQueryDto): Promise<PageResult<PlatformReconcileItem>> {
    return this.service.page(query);
  }

  @Get('summary')
  @ApiOperation({ summary: '对账概况：最近对账日、平账/差异/待处理/失败笔数与差异金额' })
  summary(): Promise<PlatformReconcileSummary> {
    return this.service.summary();
  }

  @Get(':reconcileNo')
  @ApiOperation({ summary: '台账详情（含差异明细）' })
  detail(@Param('reconcileNo') reconcileNo: string): Promise<PlatformReconcileDetail> {
    return this.service.detail(reconcileNo);
  }

  @Post('run')
  @ApiOperation({ summary: '手动补跑指定日期的对账（重算，不改动任何资金数据）' })
  run(@Body() dto: RunReconcileDto): Promise<RunReconcileResult> {
    return this.service.run(dto);
  }
}
