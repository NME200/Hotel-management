import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/auth.decorators';
import type { PageResult } from '../../common/dto/page-result.dto';
import { Member } from '../../database/entities/member.entity';
import { Permission } from '../../common/constants/permission';
import { DishQueryDto, type DishBrief } from '../merchant/dish/dto/dish.dto';
import { MemberQueryDto } from '../merchant/member/dto/member.dto';
import { OrderQueryDto, type OrderBrief } from '../merchant/order/dto/order.dto';
import { StaffQueryDto, type StaffView } from '../merchant/staff/dto/staff.dto';
import { MerchantViewService } from './merchant-view.service';
import type { MerchantStatistics } from './models/merchant-view.model';

/**
 * 平台端只读穿透接口。所有权限点统一用 platform:merchant:view，
 * 运营可看，但不能改——写操作仍然只能走商家端。
 */
@ApiTags('平台端-商户数据查看')
@Controller('platform/merchants/:merchantId')
@Permissions(Permission.MerchantView)
@ApiBearerAuth('bearer')
export class MerchantViewController {
  constructor(private readonly viewService: MerchantViewService) {}

  @Get('statistics')
  @ApiOperation({ summary: '商户经营概要' })
  statistics(
    @Param('merchantId', ParseIntPipe) merchantId: number,
  ): Promise<MerchantStatistics> {
    return this.viewService.statistics(merchantId);
  }

  @Get('dishes')
  @ApiOperation({ summary: '商户菜品列表（只读）' })
  dishes(
    @Param('merchantId', ParseIntPipe) merchantId: number,
    @Query() query: DishQueryDto,
  ): Promise<PageResult<DishBrief>> {
    return this.viewService.dishesOf(merchantId, query);
  }

  @Get('orders')
  @ApiOperation({ summary: '商户订单列表（只读）' })
  orders(
    @Param('merchantId', ParseIntPipe) merchantId: number,
    @Query() query: OrderQueryDto,
  ): Promise<PageResult<OrderBrief>> {
    return this.viewService.ordersOf(merchantId, query);
  }

  @Get('members')
  @ApiOperation({ summary: '商户会员列表（只读）' })
  members(
    @Param('merchantId', ParseIntPipe) merchantId: number,
    @Query() query: MemberQueryDto,
  ): Promise<PageResult<Member>> {
    return this.viewService.membersOf(merchantId, query);
  }

  @Get('staffs')
  @ApiOperation({ summary: '商户员工列表（只读）' })
  staffs(
    @Param('merchantId', ParseIntPipe) merchantId: number,
    @Query() query: StaffQueryDto,
  ): Promise<PageResult<StaffView>> {
    return this.viewService.staffsOf(merchantId, query);
  }
}
