import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { MerchantStatus } from '../../../common/constants/dict';
import { PageQueryDto } from '../../../common/dto/page-query.dto';

/** keyword 复用父类字段，服务层按 name/code/contactName/contactPhone 模糊匹配 */
export class MerchantQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '商户状态筛选', enum: MerchantStatus })
  @IsOptional()
  @IsEnum(MerchantStatus, { message: '商户状态取值不合法' })
  status?: MerchantStatus;
}
