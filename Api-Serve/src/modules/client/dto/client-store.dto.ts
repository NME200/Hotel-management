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
