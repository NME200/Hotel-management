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
import { Category } from '../../../database/entities/category.entity';
import { CategoryService } from './category.service';
import {
  CategoryQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  type CategoryItem,
} from './dto/category.dto';

@ApiTags('商家端-菜品分类')
@Controller('merchant/categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @Permissions(Permission.CategoryRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '分页查询分类' })
  page(
    @MerchantId() merchantId: number,
    @Query() query: CategoryQueryDto,
  ): Promise<PageResult<CategoryItem>> {
    return this.categoryService.page(merchantId, query);
  }

  @Post()
  @Permissions(Permission.CategoryCreate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '新增分类' })
  create(
    @MerchantId() merchantId: number,
    @Body() dto: CreateCategoryDto,
  ): Promise<Category> {
    return this.categoryService.create(merchantId, dto);
  }

  @Patch(':id')
  @Permissions(Permission.CategoryUpdate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '修改分类' })
  update(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categoryService.update(merchantId, id, dto);
  }

  @Delete(':id')
  @Permissions(Permission.CategoryDelete)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '删除分类，分类下有菜品时不允许删除' })
  async remove(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<null> {
    await this.categoryService.remove(merchantId, id);
    return null;
  }
}
