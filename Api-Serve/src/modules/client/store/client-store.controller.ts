import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';
import type { PageResult } from '../../../common/dto/page-result.dto';
import { ClientStoreService } from './client-store.service';
import type {
  ClientStoreListItem,
  ClientStoreView,
  ClientTableContextView,
} from './client-store.service';
import { ClientContextQueryDto, ClientTableResolveDto } from '../dto/client-store.dto';

/**
 * 顾客侧门店接口：全部公开，进店浏览不需要登录。
 *
 * 扫小程序码进来先调 /client/context 定店（拿店名、公告、营业状态），
 * 没有 scene 参数时落到 /client/stores 门店列表让人自己挑；
 * 扫的是桌上的桌位码则调 /client/tables/resolve，一次拿到门店与桌号。
 */
@ApiTags('顾客端-门店')
@Controller('client')
export class ClientStoreController {
  constructor(private readonly stores: ClientStoreService) {}

  @Public()
  @Get('context')
  @ApiOperation({ summary: '扫码定店：按商户编号取门店上下文' })
  context(@Query() query: ClientContextQueryDto): Promise<ClientStoreView> {
    return this.stores.context(query.merchantCode);
  }

  @Public()
  @Get('tables/resolve')
  @ApiOperation({ summary: '扫桌位码定桌：按 token 取门店与桌号' })
  resolveTable(@Query() query: ClientTableResolveDto): Promise<ClientTableContextView> {
    return this.stores.resolveTable(query.token);
  }

  @Public()
  @Get('stores')
  @ApiOperation({ summary: '门店列表（无扫码参数时的兜底入口）' })
  list(@Query() query: PageQueryDto): Promise<PageResult<ClientStoreListItem>> {
    return this.stores.list(query);
  }
}
