import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/constants/permission';
import { Permissions } from '../../common/decorators/auth.decorators';
import { PageQueryDto } from '../../common/dto/page-query.dto';
import type { PageResult } from '../../common/dto/page-result.dto';
import { AuditContext } from '../../common/decorators/audit-actor.decorator';
import type { AuditActor } from '../../common/models/audit-context';
import { CreatePlatformAccountDto } from './dto/create-platform-account.dto';
import { UpdatePlatformAccountDto } from './dto/update-platform-account.dto';
import type { PlatformAccountItem } from './models/platform-account.model';
import { AccountService } from './account.service';

@ApiTags('平台端-平台账号')
@Controller('platform/accounts')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @ApiBearerAuth('bearer')
  @Permissions(Permission.PlatformAccountManage)
  @Get()
  @ApiOperation({ summary: '分页查询平台账号（不返回密码散列）' })
  list(@Query() query: PageQueryDto): Promise<PageResult<PlatformAccountItem>> {
    return this.accountService.page(query);
  }

  @ApiBearerAuth('bearer')
  @Permissions(Permission.PlatformAccountManage)
  @Post()
  @ApiOperation({ summary: '创建平台账号' })
  create(
    @Body() dto: CreatePlatformAccountDto,
    @AuditContext() actor: AuditActor,
  ): Promise<PlatformAccountItem> {
    return this.accountService.create(dto, actor);
  }

  @ApiBearerAuth('bearer')
  @Permissions(Permission.PlatformAccountManage)
  @Patch(':id')
  @ApiOperation({ summary: '更新平台账号：改名、改角色、禁用、重置密码' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlatformAccountDto,
    @AuditContext() actor: AuditActor,
  ): Promise<PlatformAccountItem> {
    return this.accountService.update(id, dto, actor);
  }
}
