import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Member } from '../../database/entities/member.entity';
import { MemberCoupon } from '../../database/entities/member-coupon.entity';
import { MemberGrowthService } from './member-growth.service';

/**
 * 会员成长域。
 *
 * 单独立一个模块的原因只有一个：成长值的写入点横跨商家端（订单完成）与
 * 顾客端（补手机号、券核销），放进任何一边都会让另一边反向依赖它。
 */
@Module({
  imports: [TypeOrmModule.forFeature([Member, MemberCoupon])],
  providers: [MemberGrowthService],
  exports: [MemberGrowthService],
})
export class MemberGrowthModule {}
