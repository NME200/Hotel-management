import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/auth.decorators';
import { MerchantId } from '../../../common/decorators/current-user.decorator';
import { Permission } from '../../../common/constants/permission';
import { DashboardService } from './dashboard.service';
import type { DashboardOverview } from './models/dashboard.model';

@ApiTags('商家端-数据看板')
@Controller('merchant/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @Permissions(Permission.DashboardRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '今日经营概览、近 7 天趋势与热销菜品' })
  overview(@MerchantId() merchantId: number): Promise<DashboardOverview> {
    return this.dashboardService.overview(merchantId);
  }
}
