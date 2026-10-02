import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ActivitySlot } from '../../../common/constants/dict';

export class ClientActivityQueryDto {
  @ApiProperty({ required: false, enum: Object.values(ActivitySlot) })
  @IsOptional()
  @IsEnum(ActivitySlot)
  slot?: ActivitySlot;
}
