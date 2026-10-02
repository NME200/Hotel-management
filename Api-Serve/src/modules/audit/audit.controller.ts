import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/auth.decorators';
import { Permission } from '../../common/constants/permission';
import type { PageResult } from '../../common/dto/page-result.dto';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import type { AuditItem } from './models/audit.model';

@ApiTags('平台端-操作审计')
@Controller('platform/audits')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Permissions(Permission.PlatformAuditRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '分页查询平台操作审计日志' })
  page(@Query() query: AuditQueryDto): Promise<PageResult<AuditItem>> {
    return this.auditService.page(query);
  }

  @Get('actions')
  @Permissions(Permission.PlatformAuditRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '审计动作枚举，供筛选下拉使用' })
  actions(): { value: string; label: string }[] {
    return this.auditService.actions();
  }
}
