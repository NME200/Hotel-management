import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { Trimmed } from '../../../common/decorators/trimmed.decorator';

export class ClientContextQueryDto {
  @ApiProperty({ description: '商户编号，来自小程序码 scene 或门店列表选择', example: 'M10001' })
  @Trimmed()
  @IsString()
  @MaxLength(32)
  merchantCode!: string;
}

/**
 * 扫桌位码定桌：只带一个不可猜的桌位 token。
 *
 * 这里刻意不接受桌号 —— 桌号是明文，顾客可以随便填一个把订单下到别桌；
 * token 由商家制码时生成，只有扫到真实桌贴的人才有。
 */
export class ClientTableResolveDto {
  @ApiProperty({ description: '桌位二维码里的 token（小程序码 scene 的 t 参数）' })
  @Trimmed()
  @IsString()
  @MaxLength(64)
  token!: string;
}
