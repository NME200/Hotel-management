import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { MemberLevel, MemberStatus } from '../../../../common/constants/dict';
import { PageQueryDto } from '../../../../common/dto/page-query.dto';

export class MemberQueryDto extends PageQueryDto {
  @ApiProperty({ required: false, enum: Object.values(MemberLevel) })
  @IsOptional()
  @IsIn(Object.values(MemberLevel))
  level?: MemberLevel;

  @ApiProperty({ required: false, enum: Object.values(MemberStatus) })
  @IsOptional()
  @IsIn(Object.values(MemberStatus))
  status?: MemberStatus;
}

export class UpdateMemberDto {
  @ApiProperty({ required: false, description: '商家备注' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @ApiProperty({ required: false, enum: Object.values(MemberStatus) })
  @IsOptional()
  @IsIn(Object.values(MemberStatus))
  status?: MemberStatus;

  @ApiProperty({ required: false, enum: Object.values(MemberLevel) })
  @IsOptional()
  @IsIn(Object.values(MemberLevel))
  level?: MemberLevel;
}
