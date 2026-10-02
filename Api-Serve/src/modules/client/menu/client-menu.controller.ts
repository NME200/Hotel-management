import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import {
  ClientMerchant,
  ClientMerchantGuard,
} from '../guards/client-merchant.guard';
import type {
  ClientDishBriefView,
  ClientDishDetailView,
  ClientMenuView,
} from '../models/client-menu.model';
import { ClientMenuService } from './client-menu.service';
import { ClientSearchQueryDto } from '../dto/client-menu.dto';

/**
 * 顾客侧菜单：首页、点餐页、详情页、搜索共用。
 *
 * 全部 @Public：点餐小程序的主流法是「扫码 → 看菜 → 才决定要不要登录」，
 * 菜单卡在读未登录上就等于丢了这一单。定店与商户可用性由 ClientMerchantGuard 统一把关。
 */
@ApiTags('顾客端-菜单')
@Controller('client')
@UseGuards(ClientMerchantGuard)
export class ClientMenuController {
  constructor(private readonly menu: ClientMenuService) {}

  @Public()
  @Get('menu')
  @ApiOperation({ summary: '整棵菜单：分类 + 在售菜品（含规格与加料数量）' })
  menuView(@ClientMerchant() merchantId: number): Promise<ClientMenuView> {
    return this.menu.menu(merchantId);
  }

  @Public()
  @Get('dishes/recommend')
  @ApiOperation({ summary: '今日推荐：招牌优先，没标招牌则按销量兜底' })
  recommend(@ClientMerchant() merchantId: number): Promise<ClientDishBriefView[]> {
    return this.menu.recommend(merchantId);
  }

  @Public()
  @Get('dishes/search')
  @ApiOperation({ summary: '搜菜：菜名、副标题、分类名一起命中' })
  search(
    @ClientMerchant() merchantId: number,
    @Query() query: ClientSearchQueryDto,
  ): Promise<ClientDishBriefView[]> {
    return this.menu.search(merchantId, query.keyword);
  }

  @Public()
  @Get('dishes/:id')
  @ApiOperation({ summary: '菜品详情：规格、加料、搭配推荐' })
  detail(
    @ClientMerchant() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ClientDishDetailView> {
    return this.menu.dishDetail(merchantId, id);
  }
}
