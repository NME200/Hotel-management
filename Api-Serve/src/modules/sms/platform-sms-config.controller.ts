import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/constants/permission';
import { AuditContext } from '../../common/decorators/audit-actor.decorator';
import { Permissions } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuditActor } from '../../common/models/audit-context';
import { AuditAction, AuditTargetType } from '../audit/constants/audit-action';
import { AuditService } from '../audit/audit.service';
// DTO 必须值导入：用 import type 会让 emitDecoratorMetadata 把参数类型写成 Object，
// 全局 ValidationPipe 遇到 Object 会直接跳过，校验等于没有。
import { UpdateSmsConfigDto } from './dto/sms-config.dto';
import type { SmsConfigItem } from './models/sms-config.model';
import { SmsConfigService } from './sms-config.service';

/**
 * 平台端「短信配置」。
 *
 * 商户与门店永远不接触短信凭据：签名要按主体过云厂商审核，一套凭据服务全部商户。
 * 这一页存在的意义就是让顾客端登录页那个「获取验证码」按钮真的能按下。
 *
 * 权限两个点：`platform:sms:manage` 只有超管（能改密钥），
 * `platform:sms:read` 给运营（只看得配没配好）。
 */
@ApiTags('平台端-短信配置')
@ApiBearerAuth('bearer')
@Controller('platform/sms-config')
export class PlatformSmsConfigController {
  constructor(
    private readonly configs: SmsConfigService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Permissions(Permission.PlatformSmsRead)
  @ApiOperation({ summary: '当前短信配置（密钥只回掩码与指纹）' })
  get(): Promise<SmsConfigItem> {
    return this.configs.get();
  }

  @Put()
  @Permissions(Permission.PlatformSmsManage)
  @ApiOperation({ summary: '保存短信配置；密钥传回掩码即表示不修改' })
  async update(
    @Body() dto: UpdateSmsConfigDto,
    @AuditContext() actor: AuditActor,
    @CurrentUser('id') operatorId: number,
    @CurrentUser('realName') operatorName: string,
  ): Promise<SmsConfigItem> {
    const result = await this.configs.update(dto, { id: operatorId, name: operatorName });

    // 审计只记改了哪些字段名与开关状态，绝不记密钥值
    await this.audit.record(actor, {
      action: AuditAction.SmsConfigUpdate,
      targetType: AuditTargetType.SmsConfig,
      targetId: null,
      targetName: '短信验证码配置',
      detail: {
        fields: Object.keys(dto).filter((key) => key !== 'secrets'),
        secretTouched: Object.keys(dto.secrets ?? {}),
        enabled: result.enabled,
        driver: result.driver,
        configured: result.configured,
      },
    });
    return result;
  }

  @Post('test')
  @Permissions(Permission.PlatformSmsManage)
  @ApiOperation({ summary: '配置自检：云厂商查签名/模板审核状态，不消耗发送额度' })
  test(): Promise<{ ok: boolean; message: string; checkedAt: Date }> {
    return this.configs.test();
  }
}
