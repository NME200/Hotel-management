import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { DishService } from './dish.service';
import {
  DishInputDto,
  DishQueryDto,
  UpdateDishDto,
  UpdateDishStatusDto,
  type DishBrief,
  type DishDetail,
} from './dto/dish.dto';

@ApiTags('商家端-菜品')
@Controller('merchant/dishes')
export class DishController {
  constructor(private readonly dishService: DishService) {}

  @Get()
  @Permissions(Permission.DishRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '分页查询菜品' })
  page(
    @MerchantId() merchantId: number,
    @Query() query: DishQueryDto,
  ): Promise<PageResult<DishBrief>> {
    return this.dishService.page(merchantId, query);
  }

  @Get(':id')
  @Permissions(Permission.DishRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '菜品详情，含规格与加料分组' })
  detail(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DishDetail> {
    return this.dishService.detail(merchantId, id);
  }

  @Post()
  @Permissions(Permission.DishCreate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '新增菜品' })
  create(
    @MerchantId() merchantId: number,
    @Body() dto: DishInputDto,
  ): Promise<DishDetail> {
    return this.dishService.create(merchantId, dto);
  }

  @Patch(':id')
  @Permissions(Permission.DishUpdate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '修改菜品，规格与加料分组整体替换' })
  update(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDishDto,
  ): Promise<DishDetail> {
    return this.dishService.update(merchantId, id, dto);
  }

  @Patch(':id/status')
  @Permissions(Permission.DishToggle)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '菜品上下架' })
  updateStatus(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDishStatusDto,
  ): Promise<DishBrief> {
    return this.dishService.updateStatus(merchantId, id, dto);
  }

  @Delete(':id')
  @Permissions(Permission.DishDelete)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '删除菜品' })
  @HttpCode(HttpStatus.OK)
  async remove(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<null> {
    await this.dishService.remove(merchantId, id);
    return null;
  }
}
