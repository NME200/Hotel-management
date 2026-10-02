import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/auth.decorators';
import { MerchantId } from '../../../common/decorators/current-user.decorator';
import { Permission } from '../../../common/constants/permission';
import type { PageResult } from '../../../common/dto/page-result.dto';
import { Activity } from '../../../database/entities/activity.entity';
import { ActivityService } from './activity.service';
import {
  ActivityQueryDto,
  ActivityStatusDto,
  CreateActivityDto,
  UpdateActivityDto,
} from './dto/activity.dto';

/**
 * 商家端运营位活动：这里配的内容就是小程序首页、「我的」页、会员中心显示的卡片。
 */
@ApiTags('商家端-运营位活动')
@Controller('merchant/activities')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  @Permissions(Permission.ActivityRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '分页查询活动，可按展示位、状态、名称筛选' })
  page(
    @MerchantId() merchantId: number,
    @Query() query: ActivityQueryDto,
  ): Promise<PageResult<Activity>> {
    return this.activityService.page(merchantId, query);
  }

  @Post()
  @Permissions(Permission.ActivityCreate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '新增活动' })
  create(
    @MerchantId() merchantId: number,
    @Body() dto: CreateActivityDto,
  ): Promise<Activity> {
    return this.activityService.create(merchantId, dto);
  }

  @Patch(':id')
  @Permissions(Permission.ActivityUpdate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '修改活动' })
  update(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateActivityDto,
  ): Promise<Activity> {
    return this.activityService.update(merchantId, id, dto);
  }

  @Patch(':id/status')
  @Permissions(Permission.ActivityUpdate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '启用/停用活动' })
  updateStatus(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActivityStatusDto,
  ): Promise<Activity> {
    return this.activityService.updateStatus(merchantId, id, dto.status);
  }

  @Delete(':id')
  @Permissions(Permission.ActivityDelete)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '删除活动' })
  async remove(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<null> {
    await this.activityService.remove(merchantId, id);
    return null;
  }
}
