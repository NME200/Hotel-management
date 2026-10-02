import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/auth.decorators';
import { MerchantId } from '../../../common/decorators/current-user.decorator';
import { Permission } from '../../../common/constants/permission';
import type { PageResult } from '../../../common/dto/page-result.dto';
import { Member } from '../../../database/entities/member.entity';
import { MemberService } from './member.service';
import { MemberQueryDto, UpdateMemberDto } from './dto/member.dto';

@ApiTags('商家端-会员')
@Controller('merchant/members')
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  @Get()
  @Permissions(Permission.MemberRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '分页查询会员' })
  page(
    @MerchantId() merchantId: number,
    @Query() query: MemberQueryDto,
  ): Promise<PageResult<Member>> {
    return this.memberService.page(merchantId, query);
  }

  @Get(':id')
  @Permissions(Permission.MemberRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '会员详情' })
  detail(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Member> {
    return this.memberService.detail(merchantId, id);
  }

  @Patch(':id')
  @Permissions(Permission.MemberUpdate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '更新会员备注、等级与状态' })
  update(
    @MerchantId() merchantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMemberDto,
  ): Promise<Member> {
    return this.memberService.update(merchantId, id, dto);
  }
}
