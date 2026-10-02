import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import {
  ClientMemberId,
  ClientMerchantId,
  ClientSessionGuard,
} from '../guards/client-session.guard';
import { ClientAuthService } from './client-auth.service';
import type { ClientAuthResult, ClientSessionView } from './client-auth.service';
import { ClientLoginDto, ClientRefreshDto } from '../dto/client-auth.dto';

/**
 * 顾客登录：code 换令牌、刷新、恢复会话、退出。
 *
 * login/refresh 公开（本来就是为了换令牌），me/logout 必须带顾客令牌。
 * 门店可用性与凭据配置都在 service 里把关，这里不重复判断。
 */
@ApiTags('顾客端-登录')
@Controller('client/auth')
export class ClientAuthController {
  constructor(private readonly auth: ClientAuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'wx.login 的 code + 门店编号换顾客令牌，首次进入自动建档' })
  login(@Body() dto: ClientLoginDto): Promise<ClientAuthResult> {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: '用 refreshToken 续期，沿用同一会话' })
  refresh(@Body() dto: ClientRefreshDto): Promise<ClientAuthResult> {
    return this.auth.refresh(dto);
  }

  @UseGuards(ClientSessionGuard)
  @Get('me')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '冷启动恢复登录态：回会员信息与门店上下文，不换令牌' })
  me(
    @ClientMerchantId() merchantId: number,
    @ClientMemberId() memberId: number,
  ): Promise<ClientSessionView> {
    return this.auth.current(merchantId, memberId);
  }

  @UseGuards(ClientSessionGuard)
  @Post('logout')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '退出登录，作废当前会话' })
  logout(@CurrentUser('sessionId') sessionId: string): Promise<null> {
    return this.auth.logout(sessionId);
  }
}
