import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/auth.decorators';
import { MerchantId } from '../../../common/decorators/current-user.decorator';
import { Permission } from '../../../common/constants/permission';
import type { PageResult } from '../../../common/dto/page-result.dto';
import { OrderService } from './order.service';
import {
  OrderQueryDto,
  UpdateOrderStatusDto,
  type OrderBrief,
  type OrderDetail,
  type OrderSummary,
} from './dto/order.dto';

@ApiTags('商家端-订单')
@Controller('merchant/orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @Permissions(Permission.OrderRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '分页查询订单' })
  page(
    @MerchantId() merchantId: number,
    @Query() query: OrderQueryDto,
  ): Promise<PageResult<OrderBrief>> {
    return this.orderService.page(merchantId, query);
  }

  /** 声明在 :id 之前，避免 summary 被当作订单 ID 解析。 */
  @Get('summary')
  @Permissions(Permission.OrderRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '时间段订单汇总' })
  summary(
    @MerchantId() merchantId: number,
    @Query() query: OrderQueryDto,
  ): Promise<OrderSummary> {
    return this.orderService.summary(merchantId, query);
  }

  @Get(':id')
  @Permissions(Permission.OrderRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '订单详情' })
  detail(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<OrderDetail> {
    return this.orderService.detail(merchantId, id);
  }

  @Patch(':id/status')
  @Permissions(Permission.OrderUpdate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '订单状态流转，完成时自动累计会员与菜品销量' })
  updateStatus(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<OrderDetail> {
    return this.orderService.updateStatus(merchantId, id, dto);
  }
}
