import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ClientMemberId,
  ClientMerchantId,
  ClientSessionGuard,
} from '../guards/client-session.guard';
import { ClientMemberService } from './client-member.service';
import type { ClientMemberBrief, ClientMemberCenter } from '../models/client-member.model';
import { UpdateClientProfileDto } from '../dto/client-auth.dto';

/**
 * 个人中心与会员中心的数据源。
 *
 * 「我的」页那三项数字（券/积分/余额）与会员中心页的成长值进度条
 * 都出自这里，等级、下一档、进度全部后端算好，前端不参与档位判断。
 */
@ApiTags('顾客端-会员')
@Controller('client/member')
@UseGuards(ClientSessionGuard)
export class ClientMemberController {
  constructor(private readonly members: ClientMemberService) {}

  @Get()
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '会员档案：等级、成长值、积分、余额、未使用券数' })
  profile(
    @ClientMerchantId() merchantId: number,
    @ClientMemberId() memberId: number,
  ): Promise<ClientMemberBrief> {
    return this.members.brief(merchantId, memberId);
  }

  @Get('center')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '会员中心：权益、成长任务、会员日' })
  center(
    @ClientMerchantId() merchantId: number,
    @ClientMemberId() memberId: number,
  ): Promise<ClientMemberCenter> {
    return this.members.center(merchantId, memberId);
  }

  @Patch('profile')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '修改昵称/头像/性别，或首次绑定手机号' })
  update(
    @ClientMerchantId() merchantId: number,
    @ClientMemberId() memberId: number,
    @Body() dto: UpdateClientProfileDto,
  ): Promise<ClientMemberBrief> {
    return this.members.updateProfile(merchantId, memberId, dto);
  }
}
