import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/auth.decorators';
import type { PageResult } from '../../../common/dto/page-result.dto';
import { Permission } from '../../../common/constants/permission';
import {
  CustomerQueryDto,
  MemberProfileQueryDto,
  UpdateCustomerDto,
  UpdateMemberProfileDto,
} from './dto/member.dto';
import {
  CustomerDetail,
  CustomerRow,
  MemberProfileRow,
  PlatformMemberService,
} from './member.service';

/**
 * 平台端会员管理。
 *
 * 商家端不再有会员模块：顾客账号现在跨门店，「停用」这种动作在单店维度已经没有意义，
 * 而且让每家店各自改同一个账号会互相打架。列表按顾客（身份）给，
 * 详情里再展开他在各家店的档案（等级/成长值/余额/券都是各店独立的）。
 */
@ApiTags('平台端-会员管理')
@Controller('platform/members')
@ApiBearerAuth('bearer')
export class PlatformMemberController {
  constructor(private readonly members: PlatformMemberService) {}

  @Get()
  @Permissions(Permission.PlatformMemberRead)
  @ApiOperation({ summary: '顾客列表（跨商户身份），可按昵称/手机号/状态筛选' })
  page(@Query() query: CustomerQueryDto): Promise<PageResult<CustomerRow>> {
    return this.members.pageCustomers(query);
  }

  @Get('profiles')
  @Permissions(Permission.PlatformMemberRead)
  @ApiOperation({ summary: '各店会员档案列表，可按店、等级、状态筛选' })
  profiles(
    @Query() query: MemberProfileQueryDto,
  ): Promise<PageResult<MemberProfileRow>> {
    return this.members.pageProfiles(query);
  }

  @Get(':id')
  @Permissions(Permission.PlatformMemberRead)
  @ApiOperation({ summary: '顾客详情：身份信息 + 他在每家店的档案' })
  detail(@Param('id', ParseIntPipe) id: number): Promise<CustomerDetail> {
    return this.members.customerDetail(id);
  }

  @Patch(':id')
  @Permissions(Permission.PlatformMemberManage)
  @ApiOperation({ summary: '停用/恢复顾客账号（全平台生效）' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerDto,
  ): Promise<CustomerRow> {
    return this.members.updateCustomer(id, dto);
  }

  /** 档案级操作：平台代商户改备注或停用这一家店里的会员身份。 */
  @Patch('profile/:id')
  @Permissions(Permission.PlatformMemberManage)
  @ApiOperation({ summary: '修改某家店里的会员档案（备注、启停）' })
  updateProfile(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMemberProfileDto,
  ): Promise<MemberProfileRow> {
    return this.members.updateProfile(id, dto);
  }
}
