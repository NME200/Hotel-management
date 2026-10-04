import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MemberLevel, MemberStatus } from '../../../../common/constants/dict';
import { Trimmed } from '../../../../common/decorators/trimmed.decorator';
import { PageQueryDto } from '../../../../common/dto/page-query.dto';

export class CustomerQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: Object.values(MemberStatus) })
  @IsOptional()
  @IsIn(Object.values(MemberStatus))
  status?: MemberStatus;
}

export class UpdateCustomerDto {
  @ApiPropertyOptional({
    enum: Object.values(MemberStatus),
    description: '平台账号状态：disabled 即全平台不能下单，与单店停用是两回事',
  })
  @IsOptional()
  @IsIn(Object.values(MemberStatus))
  status?: MemberStatus;
}

export class MemberProfileQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '只看这一家店' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999999)
  merchantId?: number;

  @ApiPropertyOptional({ description: '只看这个顾客的档案' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId?: number;

  @ApiPropertyOptional({ enum: Object.values(MemberLevel) })
  @IsOptional()
  @IsIn(Object.values(MemberLevel))
  level?: MemberLevel;

  @ApiPropertyOptional({ enum: Object.values(MemberStatus) })
  @IsOptional()
  @IsIn(Object.values(MemberStatus))
  status?: MemberStatus;
}

export class UpdateMemberProfileDto {
  @ApiPropertyOptional({ description: '商家备注（属于这一家店的档案，不跨店）' })
  @IsOptional()
  @Trimmed()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @ApiPropertyOptional({
    enum: Object.values(MemberStatus),
    description: '这家店是否继续认这个会员',
  })
  @IsOptional()
  @IsIn(Object.values(MemberStatus))
  status?: MemberStatus;
}
