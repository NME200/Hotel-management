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
import { CurrentUser, MerchantId } from '../../../common/decorators/current-user.decorator';
import { Permission } from '../../../common/constants/permission';
import type { PageResult } from '../../../common/dto/page-result.dto';
import { StaffService } from './staff.service';
import {
  CreateStaffDto,
  ResetStaffPasswordDto,
  StaffQueryDto,
  UpdateStaffDto,
  type StaffView,
} from './dto/staff.dto';

@ApiTags('商家端-员工')
@Controller('merchant/staffs')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @Permissions(Permission.StaffRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '分页查询员工' })
  page(
    @MerchantId() merchantId: number,
    @Query() query: StaffQueryDto,
  ): Promise<PageResult<StaffView>> {
    return this.staffService.page(merchantId, query);
  }

  @Post()
  @Permissions(Permission.StaffCreate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '新增员工' })
  create(
    @MerchantId() merchantId: number,
    @Body() dto: CreateStaffDto,
  ): Promise<StaffView> {
    return this.staffService.create(merchantId, dto);
  }

  @Patch(':id')
  @Permissions(Permission.StaffUpdate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '修改员工资料与角色' })
  update(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStaffDto,
  ): Promise<StaffView> {
    return this.staffService.update(merchantId, id, dto);
  }

  @Patch(':id/password')
  @Permissions(Permission.StaffUpdate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '重置员工密码' })
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetStaffPasswordDto,
  ): Promise<null> {
    return this.staffService.resetPassword(merchantId, id, dto);
  }

  @Delete(':id')
  @Permissions(Permission.StaffDelete)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '删除员工，不能删除自己或最后一个老板账号' })
  @HttpCode(HttpStatus.OK)
  remove(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') operatorId: number,
  ): Promise<null> {
    return this.staffService.remove(merchantId, id, operatorId);
  }
}
