import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/constants/permission';
import { Permissions } from '../../common/decorators/auth.decorators';
import type { PageResult } from '../../common/dto/page-result.dto';
import { PlatformProfitShareQueryDto } from './dto/platform-profit-share-query.dto';
import type {
  PlatformProfitShareItem,
  PlatformProfitShareSummary,
} from './models/platform-profit-share.model';
import { PlatformProfitShareService } from './services/platform-profit-share.service';

/**
 * 平台端分账。纯只读：看得到平台抽佣，但不能直接动这笔钱——
 * 解冻由定时任务按 T+1 自动执行，人工干预走支付流水页的重试入口。
 */
@ApiTags('平台端-分账')
@Controller('platform/profit-shares')
@Permissions(Permission.PlatformPaymentRead)
@ApiBearerAuth('bearer')
export class PlatformProfitShareController {
  constructor(private readonly service: PlatformProfitShareService) {}

  @Get()
  @ApiOperation({ summary: '平台分账流水分页，可按商户/渠道/状态/到期日/订单号筛选' })
  page(
    @Query() query: PlatformProfitShareQueryDto,
  ): Promise<PageResult<PlatformProfitShareItem>> {
    return this.service.page(query);
  }

  @Get('summary')
  @ApiOperation({ summary: '分账概况：累计与今日抽佣、待解冻/已解冻/失败笔数' })
  summary(): Promise<PlatformProfitShareSummary> {
    return this.service.summary();
  }

  @Get(':shareNo')
  @ApiOperation({ summary: '分账单详情（该支付单的平台与商户两条记录）' })
  detail(@Param('shareNo') shareNo: string): Promise<PlatformProfitShareItem> {
    return this.service.detail(shareNo);
  }
}
