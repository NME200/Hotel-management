import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Not, type FindOptionsWhere, type Repository } from 'typeorm';
import { OrderStatus } from '../../common/constants/dict';
import type { PageResult } from '../../common/dto/page-result.dto';
import { addDays, startOfDay } from '../../common/utils/date.util';
import { Dish } from '../../database/entities/dish.entity';
import { Member } from '../../database/entities/member.entity';
import { Merchant } from '../../database/entities/merchant.entity';
import { MerchantStaff } from '../../database/entities/merchant-staff.entity';
import { Order } from '../../database/entities/order.entity';
import { DishQueryDto, type DishBrief } from '../merchant/dish/dto/dish.dto';
import { DishService } from '../merchant/dish/dish.service';
import { MemberQueryDto } from '../merchant/member/dto/member.dto';
import { MemberService } from '../merchant/member/member.service';
import { OrderQueryDto, type OrderBrief } from '../merchant/order/dto/order.dto';
import { OrderService } from '../merchant/order/order.service';
import { StaffQueryDto, type StaffView } from '../merchant/staff/dto/staff.dto';
import { StaffService } from '../merchant/staff/staff.service';
import type { MerchantStatistics } from './models/merchant-view.model';

/**
 * 平台端商户数据只读穿透：客服排障时按商户 ID 查看其经营数据。
 * 查询完全复用商家端 service，只是把租户键从"登录态"换成"路径参数 + 商户存在性校验"，
 * 两端字段结构因此天然一致，不会漂移出两套实现。
 */
@Injectable()
export class MerchantViewService {
  constructor(
    @InjectRepository(Merchant) private readonly merchants: Repository<Merchant>,
    @InjectRepository(Dish) private readonly dishes: Repository<Dish>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Member) private readonly members: Repository<Member>,
    @InjectRepository(MerchantStaff) private readonly staffs: Repository<MerchantStaff>,
    private readonly dishService: DishService,
    private readonly orderService: OrderService,
    private readonly memberService: MemberService,
    private readonly staffService: StaffService,
  ) {}

  async dishesOf(merchantId: number, query: DishQueryDto): Promise<PageResult<DishBrief>> {
    return this.dishService.page(await this.assertMerchant(merchantId), query);
  }

  async ordersOf(merchantId: number, query: OrderQueryDto): Promise<PageResult<OrderBrief>> {
    return this.orderService.page(await this.assertMerchant(merchantId), query);
  }

  async membersOf(merchantId: number, query: MemberQueryDto): Promise<PageResult<Member>> {
    return this.memberService.page(await this.assertMerchant(merchantId), query);
  }

  async staffsOf(merchantId: number, query: StaffQueryDto): Promise<PageResult<StaffView>> {
    return this.staffService.page(await this.assertMerchant(merchantId), query);
  }

  async statistics(merchantId: number): Promise<MerchantStatistics> {
    const id = await this.assertMerchant(merchantId);
    const billable: FindOptionsWhere<Order> = {
      merchantId: id,
      status: Not(In([OrderStatus.Cancelled, OrderStatus.Refunded])),
    };
    const weekStart = startOfDay(addDays(new Date(), -6));

    const [dishCount, orderCount, memberCount, staffCount, summed, last7Orders] =
      await Promise.all([
        this.dishes.count({ where: { merchantId: id } }),
        this.orders.count({ where: { merchantId: id } }),
        this.members.count({ where: { merchantId: id } }),
        this.staffs.count({ where: { merchantId: id } }),
        this.orders.sum('payAmount', billable),
        this.orders.count({ where: { ...billable, createdAt: MoreThanOrEqual(weekStart) } }),
      ]);

    return {
      dishCount,
      orderCount,
      memberCount,
      staffCount,
      totalTurnover: Number((summed ?? 0).toFixed(2)),
      last7Orders,
    };
  }

  private async assertMerchant(merchantId: number): Promise<number> {
    if (!(await this.merchants.exists({ where: { id: merchantId } }))) {
      throw new NotFoundException('商户不存在');
    }
    return merchantId;
  }
}
