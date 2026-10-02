import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { DineType, OrderStatus } from '../../../../common/constants/dict';
import { PageQueryDto } from '../../../../common/dto/page-query.dto';
import { Order } from '../../../../database/entities/order.entity';

export class OrderQueryDto extends PageQueryDto {
  @ApiProperty({ required: false, enum: Object.values(OrderStatus) })
  @IsOptional()
  @IsIn(Object.values(OrderStatus))
  status?: OrderStatus;

  @ApiProperty({ required: false, enum: Object.values(DineType) })
  @IsOptional()
  @IsIn(Object.values(DineType))
  dineType?: DineType;

  @ApiProperty({ required: false, description: '下单起始日期 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ required: false, description: '下单结束日期 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({
    enum: Object.values(OrderStatus),
    description: '目标状态，只允许按订单流转顺序推进或取消/退款',
  })
  @IsIn([
    OrderStatus.Accepted,
    OrderStatus.Preparing,
    OrderStatus.Ready,
    OrderStatus.Completed,
    OrderStatus.Cancelled,
    OrderStatus.Refunded,
  ])
  status!: OrderStatus;

  @ApiProperty({ required: false, description: '商家处理备注，取消时作为取消原因' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;
}

export type OrderBrief = Omit<Order, 'member'> & {
  itemCount: number;
};

export type OrderDetail = OrderBrief;

export interface OrderSummary {
  orderCount: number;
  turnover: number;
  pendingCount: number;
  completedCount: number;
  cancelledCount: number;
}
