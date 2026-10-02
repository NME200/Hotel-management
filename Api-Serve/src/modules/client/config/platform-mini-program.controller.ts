import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction, AuditTargetType } from '../../audit/constants/audit-action';
import { AuditService } from '../../audit/audit.service';
import { AuditContext } from '../../../common/decorators/audit-actor.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Permissions } from '../../../common/decorators/auth.decorators';
import { Permission } from '../../../common/constants/permission';
import type { AuditActor } from '../../../common/models/audit-context';
import type { AuthUser } from '../../../common/models/auth-context';
import { MiniProgramConfigService } from './mini-program-config.service';
// DTO 必须是值导入：用 import type 会让 emitDecoratorMetadata 把参数类型写成 Object，
// 全局 ValidationPipe 遇到 Object 直接跳过，校验等于没有，非法 body 会一路灌进 service。
import { UpdateMiniProgramConfigDto } from './dto/mini-program-config.dto';
import type { MiniProgramConfigView } from './dto/mini-program-config.dto';
import { MiniProgramConnectivityService } from './mini-program-connectivity.service';

/**
 * 平台端「小程序配置」：AppID 明文可看，AppSecret 只写不读。
 * 权限点 platform:mini-program:manage 只授予 platform_admin。
 */
@ApiTags('client/小程序配置')
@ApiBearerAuth('bearer')
@Controller('platform/mini-program-config')
export class PlatformMiniProgramConfigController {
  constructor(
    private readonly configs: MiniProgramConfigService,
    private readonly connectivity: MiniProgramConnectivityService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Permissions(Permission.PlatformMiniProgramManage)
  @ApiOperation({ summary: '读取小程序配置（密钥只回掩码与指纹）' })
  view(): Promise<MiniProgramConfigView> {
    return this.configs.getView();
  }

  @Put()
  @Permissions(Permission.PlatformMiniProgramManage)
  @ApiOperation({ summary: '保存小程序配置' })
  async update(
    @Body() dto: UpdateMiniProgramConfigDto,
    @CurrentUser() user: AuthUser,
    @AuditContext() actor: AuditActor,
  ): Promise<MiniProgramConfigView> {
    const before = await this.configs.getView();
    const view = await this.configs.update(dto, { id: user.id, name: user.realName });
    await this.audit.record(actor, {
      action: AuditAction.MiniProgramConfigUpdate,
      targetType: AuditTargetType.MiniProgram,
      targetId: 1,
      targetName: view.appId ?? '-',
      detail: {
        appIdFrom: before.appId,
        appIdTo: view.appId,
        loginEnabled: view.loginEnabled,
        // 只记「改没改密钥」，更细的内容属于密钥本身，不进审计表
        secretChanged: before.secretFingerprint !== view.secretFingerprint,
      },
    });
    return view;
  }

  @Post('test')
  @Permissions(Permission.PlatformMiniProgramManage)
  @ApiOperation({ summary: '连通性自检：校验配置完整性并探测微信接口可达性' })
  test(): Promise<{ ok: boolean; message: string; checkedAt: Date }> {
    return this.connectivity.check();
  }
}
