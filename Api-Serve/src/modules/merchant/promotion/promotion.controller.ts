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
import { Promotion } from '../../../database/entities/promotion.entity';
import { PromotionService } from './promotion.service';
import {
  CreatePromotionDto,
  PromotionQueryDto,
  PromotionStatusDto,
  UpdatePromotionDto,
} from './dto/promotion.dto';

/**
 * 商家端限时活动：这里的价格就是顾客结算时付的钱。
 *
 * 与「活动运营位」的分工：运营位决定小程序上说什么话，限时活动决定哪道菜按多少钱卖。
 */
@ApiTags('商家端-限时活动')
@Controller('merchant/promotions')
export class PromotionController {
  constructor(private readonly promotionService: PromotionService) {}

  @Get()
  @Permissions(Permission.PromotionRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '分页查询限时活动' })
  page(
    @MerchantId() merchantId: number,
    @Query() query: PromotionQueryDto,
  ): Promise<PageResult<Promotion>> {
    return this.promotionService.page(merchantId, query);
  }

  @Post()
  @Permissions(Permission.PromotionCreate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '新增限时活动' })
  create(
    @MerchantId() merchantId: number,
    @Body() dto: CreatePromotionDto,
  ): Promise<Promotion> {
    return this.promotionService.create(merchantId, dto);
  }

  @Patch(':id')
  @Permissions(Permission.PromotionUpdate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '修改限时活动' })
  update(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePromotionDto,
  ): Promise<Promotion> {
    return this.promotionService.update(merchantId, id, dto);
  }

  @Patch(':id/status')
  @Permissions(Permission.PromotionUpdate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '启用/停用限时活动' })
  updateStatus(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PromotionStatusDto,
  ): Promise<Promotion> {
    return this.promotionService.updateStatus(merchantId, id, dto.status);
  }

  @Delete(':id')
  @Permissions(Permission.PromotionDelete)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '删除限时活动，被运营位卡关联时不允许删除' })
  async remove(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<null> {
    await this.promotionService.remove(merchantId, id);
    return null;
  }
}
