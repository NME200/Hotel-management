import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/auth.decorators';
import { MerchantId } from '../../../common/decorators/current-user.decorator';
import { Permission } from '../../../common/constants/permission';
import { Store } from '../../../database/entities/store.entity';
import { UpdateStoreDto } from './dto/update-store.dto';
import { StoreService } from './store.service';

@ApiTags('商家端-门店')
@Controller('merchant/store')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Get()
  @Permissions(Permission.StoreRead)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '获取门店信息' })
  get(@MerchantId() merchantId: number): Promise<Store> {
    return this.storeService.get(merchantId);
  }

  @Patch()
  @Permissions(Permission.StoreUpdate)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: '更新门店信息' })
  update(
    @MerchantId() merchantId: number,
    @Body() dto: UpdateStoreDto,
  ): Promise<Store> {
    return this.storeService.update(merchantId, dto);
  }
}
