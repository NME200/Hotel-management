import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AccountStatus, StaffRole } from '../../../../common/constants/dict';
import { Trimmed } from '../../../../common/decorators/trimmed.decorator';
import { PageQueryDto } from '../../../../common/dto/page-query.dto';
import { MerchantStaff } from '../../../../database/entities/merchant-staff.entity';

const USERNAME_RULE = /^[a-zA-Z0-9_]{3,32}$/;

export class StaffQueryDto extends PageQueryDto {
  @ApiProperty({ required: false, enum: Object.values(StaffRole) })
  @IsOptional()
  @IsIn(Object.values(StaffRole))
  role?: StaffRole;
}

export class CreateStaffDto {
  @ApiProperty({ description: '登录账号，商户内唯一' })
  @IsString()
  @Matches(USERNAME_RULE, { message: '登录账号只能包含字母、数字、下划线，长度 3-32' })
  username!: string;

  @ApiProperty({ description: '初始密码' })
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password!: string;

  @ApiProperty({ description: '姓名' })
  @IsString()
  @IsNotEmpty({ message: '姓名不能为空' })
  @Trimmed()
  @MaxLength(64)
  realName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ enum: Object.values(StaffRole) })
  @IsIn(Object.values(StaffRole))
  role!: StaffRole;

  @ApiProperty({ required: false, enum: Object.values(AccountStatus) })
  @IsOptional()
  @IsIn(Object.values(AccountStatus))
  status?: AccountStatus;
}

/** 账号名与密码不在这里改，密码走独立的重置接口。 */
export class UpdateStaffDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '姓名不能为空' })
  @Trimmed()
  @MaxLength(64)
  realName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ required: false, enum: Object.values(StaffRole) })
  @IsOptional()
  @IsIn(Object.values(StaffRole))
  role?: StaffRole;

  @ApiProperty({ required: false, enum: Object.values(AccountStatus) })
  @IsOptional()
  @IsIn(Object.values(AccountStatus))
  status?: AccountStatus;
}

export class ResetStaffPasswordDto {
  @ApiProperty({ description: '新密码' })
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password!: string;
}

export type StaffView = Omit<MerchantStaff, 'passwordHash'>;
