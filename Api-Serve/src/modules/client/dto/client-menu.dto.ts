import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { Trimmed } from '../../../common/decorators/trimmed.decorator';

export class ClientSearchQueryDto {
  @ApiProperty({ description: '搜索关键词：菜名、副标题或分类名' })
  @Trimmed()
  @IsString()
  @MaxLength(32)
  keyword!: string;
}
