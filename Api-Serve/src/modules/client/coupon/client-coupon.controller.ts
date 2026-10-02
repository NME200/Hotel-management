import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { MemberCouponStatus } from '../../../common/constants/dict';
import {
  ClientMerchant,
  ClientMerchantGuard,
} from '../guards/client-merchant.guard';
import {
  ClientMemberId,
  ClientMerchantId,
  ClientSessionGuard,
} from '../guards/client-session.guard';
import type {
  ClaimableCouponView,
  ClientCouponView,
} from '../models/client-coupon.model';
import { ClientCouponService } from './client-coupon.service';
import {
  ClaimCouponDto,
  ClientCouponQueryDto,
  RedeemCouponDto,
} from '../dto/client-coupon.dto';

/**
 * 顾客优惠券。
 *
 * 除「领券中心」外全部要求登录：三档列表、张数、领取、兑换都属于某个会员的数据。
 * 领券中心放开是刻意的——首页 Banner 要在顾客登录前就把真实可领的券讲清楚，
 * 领取那一刻再要登录也不迟。
 */
@ApiTags('顾客端-优惠券')
@Controller('client/coupons')
export class ClientCouponController {
  constructor(private readonly coupons: ClientCouponService) {}

  @Public()
  @UseGuards(ClientMerchantGuard)
  @Get('claimable')
  @ApiOperation({ summary: '领券中心：当前门店可领的券、剩余数量' })
  claimable(@ClientMerchant() merchantId: number): Promise<ClaimableCouponView[]> {
    return this.coupons.claimable(merchantId, null);
  }

  @UseGuards(ClientSessionGuard)
  @Get('mine')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '我的优惠券，按未使用/已使用/已过期筛选' })
  mine(
    @ClientMerchantId() merchantId: number,
    @ClientMemberId() memberId: number,
    @Query() query: ClientCouponQueryDto,
  ): Promise<ClientCouponView[]> {
    return this.coupons.list(
      merchantId,
      memberId,
      query.status ?? MemberCouponStatus.Unused,
    );
  }

  @UseGuards(ClientSessionGuard)
  @Get('counts')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '三档状态各多少张，用于筛选标签与个人中心角标' })
  counts(
    @ClientMerchantId() merchantId: number,
    @ClientMemberId() memberId: number,
  ): Promise<{ unused: number; used: number; expired: number }> {
    return this.coupons.counts(merchantId, memberId);
  }

  @UseGuards(ClientSessionGuard)
  @Post('claim')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '领取一张券' })
  claim(
    @ClientMerchantId() merchantId: number,
    @ClientMemberId() memberId: number,
    @Body() dto: ClaimCouponDto,
  ): Promise<ClientCouponView> {
    return this.coupons.claim(merchantId, memberId, dto.templateId);
  }

  @UseGuards(ClientSessionGuard)
  @Post('redeem')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '兑换码兑换一张券' })
  redeem(
    @ClientMerchantId() merchantId: number,
    @ClientMemberId() memberId: number,
    @Body() dto: RedeemCouponDto,
  ): Promise<ClientCouponView> {
    return this.coupons.redeem(merchantId, memberId, dto.code);
  }
}
