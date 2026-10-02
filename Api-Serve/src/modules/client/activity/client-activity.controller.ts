import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { ActivitySlot } from '../../../common/constants/dict';
import {
  ClientMerchant,
  ClientMerchantGuard,
} from '../guards/client-merchant.guard';
import { ClientActivityQueryDto } from '../dto/client-activity.dto';
import type { ActivityCardView } from '../models/client-activity.model';
import { ClientActivityService } from './client-activity.service';

/**
 * 顾客端运营位。
 *
 * 免登录：首页 Banner、「我的」页卡在顾客登录前就要显示真实内容，
 * 会员身份不影响这三张卡（都不含个人数据）。
 */
@ApiTags('顾客端-运营位')
@Controller('client/activities')
export class ClientActivityController {
  constructor(private readonly activities: ClientActivityService) {}

  @Public()
  @UseGuards(ClientMerchantGuard)
  @Get()
  @ApiOperation({ summary: '按展示位取运营位卡片，slot 默认 home' })
  cards(
    @ClientMerchant() merchantId: number,
    @Query() query: ClientActivityQueryDto,
  ): Promise<ActivityCardView[]> {
    return this.activities.cards(merchantId, query.slot ?? ActivitySlot.Home);
  }
}
