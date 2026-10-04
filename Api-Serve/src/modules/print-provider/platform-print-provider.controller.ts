import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/constants/permission';
import { AuditContext } from '../../common/decorators/audit-actor.decorator';
import { Permissions } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BusinessException } from '../../common/exceptions/business.exception';
import type { AuditActor } from '../../common/models/audit-context';
import { AuditAction, AuditTargetType } from '../audit/constants/audit-action';
import { AuditService } from '../audit/audit.service';
import { PrintProvider } from './constants/print-provider.constant';
// DTO 必须值导入：用 import type 会让 emitDecoratorMetadata 把参数类型写成 Object，
// 全局 ValidationPipe 遇到 Object 会直接跳过，校验等于没有。
import { UpdatePrintProviderDto } from './dto/print-provider.dto';
import type { PrintProviderItem } from './models/print-provider.model';
import { PrintProviderConfigService } from './print-provider-config.service';

/**
 * 平台端「云打印机配置」。
 *
 * 商户买了打印机之后只需要在商家端填设备号（sn），厂商账号与密钥全部在这里配 ——
 * 所以这个控制器是「商家端只填编码就能出纸」这句话的前提。
 *
 * 权限点 `platform:print:manage` 只授予 platform_admin：密钥是平台与厂商之间的
 * 合同凭据，运营可以看状态但不该能改。
 */
@ApiTags('平台端-云打印机配置')
@ApiBearerAuth('bearer')
@Controller('platform/print-providers')
export class PlatformPrintProviderController {
  constructor(
    private readonly configs: PrintProviderConfigService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Permissions(Permission.PlatformPrintManage)
  @ApiOperation({ summary: '厂商配置列表（密钥只回掩码与指纹）' })
  list(): Promise<PrintProviderItem[]> {
    return this.configs.list();
  }

  @Put(':provider')
  @Permissions(Permission.PlatformPrintManage)
  @ApiOperation({ summary: '保存厂商配置；密钥传回掩码即表示不修改' })
  async update(
    @Param('provider') provider: string,
    @Body() dto: UpdatePrintProviderDto,
    @AuditContext() actor: AuditActor,
    @CurrentUser('id') operatorId: number,
    @CurrentUser('realName') operatorName: string,
  ): Promise<PrintProviderItem> {
    const parsed = this.parseProvider(provider);
    const result = await this.configs.update(parsed, dto, {
      id: operatorId,
      name: operatorName,
    });

    // 审计只记改了哪些字段名与开关状态，绝不记密钥值
    await this.audit.record(actor, {
      action: AuditAction.PrintProviderUpdate,
      targetType: AuditTargetType.PrintProvider,
      targetId: null,
      targetName: result.label,
      detail: {
        fields: Object.keys(dto).filter((key) => key !== 'secrets'),
        secretFieldsTouched: Object.keys(dto.secrets ?? {}),
        enabled: result.enabled,
        configured: result.configured,
      },
    });
    return result;
  }

  @Post(':provider/test')
  @Permissions(Permission.PlatformPrintManage)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '厂商配置自检：向网关换一次访问权' })
  test(
    @Param('provider') provider: string,
  ): Promise<{ ok: boolean; message: string; checkedAt: Date }> {
    return this.configs.test(this.parseProvider(provider));
  }

  private parseProvider(value: string): PrintProvider {
    const providers: string[] = Object.values(PrintProvider);
    if (!providers.includes(value)) {
      throw BusinessException.badRequest(`未知打印机厂商: ${value}`);
    }
    return value as PrintProvider;
  }
}
