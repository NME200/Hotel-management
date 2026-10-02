import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/auth.decorators';
import { Permission } from '../../../common/constants/permission';
import { PlatformDashboardService } from './platform-dashboard.service';
import type { PlatformOverview } from './models/platform-overview.model';

@ApiTags('平台端-经营看板')
@Controller('platform/dashboard')
export class PlatformDashboardController {
  constructor(private readonly dashboardService: PlatformDashboardService) {}

  @Get('overview')
  @Permissions(Permission.PlatformDashboardRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '全平台经营概览、近 7 天趋势与商户贡献榜' })
  overview(): Promise<PlatformOverview> {
    return this.dashboardService.overview();
  }
}
