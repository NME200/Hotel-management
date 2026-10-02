import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuditContext } from '../../common/decorators/audit-actor.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuditActor } from '../../common/models/audit-context';
import type { AuthUser } from '../../common/models/auth-context';
import {
  ChangePasswordDto,
  MerchantLoginDto,
  PlatformLoginDto,
  RefreshTokenDto,
} from './dto/login.dto';
import type { AuthResult, AuthUserProfile } from './models/auth-result.model';
import { AuthService } from './auth.service';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('merchant/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '商家端登录（商户编号 + 员工账号）' })
  loginByMerchant(@Body() dto: MerchantLoginDto): Promise<AuthResult> {
    return this.authService.loginByMerchant(dto);
  }

  @Public()
  @Post('platform/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '平台端登录' })
  loginByPlatform(
    @Body() dto: PlatformLoginDto,
    @AuditContext() actor: AuditActor,
  ): Promise<AuthResult> {
    return this.authService.loginByPlatform(dto, actor);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '用 refreshToken 换新的令牌对' })
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthResult> {
    return this.authService.refresh(dto);
  }

  @ApiBearerAuth('bearer')
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '退出登录，作废当前会话' })
  async logout(
    @CurrentUser() user: AuthUser,
    @AuditContext() actor: AuditActor,
  ): Promise<null> {
    await this.authService.logout(user, actor);
    return null;
  }

  @ApiBearerAuth('bearer')
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '修改本人密码，成功后当前会话失效' })
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @AuditContext() actor: AuditActor,
  ): Promise<null> {
    return this.authService.changePassword(user, dto, actor);
  }

  @ApiBearerAuth('bearer')
  @Get('profile')
  @ApiOperation({ summary: '获取当前登录账号信息与权限点' })
  profile(@CurrentUser() user: AuthUser): Promise<AuthUserProfile> {
    return this.authService.profileOf(user);
  }
}
