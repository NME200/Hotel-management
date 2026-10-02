import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ActivityAction, ActivitySlot, ActivityStatus } from '../../../../common/constants/dict';
import { Trimmed } from '../../../../common/decorators/trimmed.decorator';
import { PageQueryDto } from '../../../../common/dto/page-query.dto';

/** 与平台端到期时间同一口径：ISO 字符串或 YYYY-MM-DD HH:mm[:ss]，也允许只给日期 */
const DATE_TIME_RULE =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** 顾客端能映射成品牌色字符的图标机器码，其它值会退回默认字符 */
const ICON_CODES = [
  'calendar',
  'ticket',
  'bolt',
  'points',
  'price',
  'order',
  'orders',
  'profile',
  'service',
];

export class CreateActivityDto {
  @ApiProperty({ description: '活动名称，只在商家端识别用' })
  @IsString()
  @IsNotEmpty({ message: '活动名称不能为空' })
  @Trimmed()
  @MaxLength(64)
  name!: string;

  @ApiProperty({ enum: Object.values(ActivitySlot), description: '展示位' })
  @IsEnum(ActivitySlot, { message: '展示位只能是 home/mine/member' })
  slot!: ActivitySlot;

  @ApiProperty({ description: '顾客端主标题，整句话原样显示在小程序上' })
  @IsString()
  @IsNotEmpty({ message: '主标题不能为空' })
  @Trimmed()
  @MaxLength(64)
  title!: string;

  @ApiPropertyOptional({ description: '顾客端副标题' })
  @IsOptional()
  @IsString()
  @Trimmed()
  @MaxLength(128)
  subTitle?: string | null;

  @ApiPropertyOptional({ description: '图标机器码' })
  @IsOptional()
  @IsIn(ICON_CODES, { message: '图标取值不在可选范围内' })
  @MaxLength(16)
  icon?: string | null;

  @ApiPropertyOptional({ enum: Object.values(ActivityAction) })
  @IsOptional()
  @IsEnum(ActivityAction, { message: '跳转目标不存在' })
  action?: ActivityAction;

  @ApiPropertyOptional({
    description: 'action=promotion 时必填：关联的限时活动 ID，顾客点卡片进菜单只看这个活动的菜',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  promotionId?: number | null;

  @ApiPropertyOptional({ description: '生效开始时间，留空表示立即生效', example: '2026-10-08 11:00:00' })
  @IsOptional()
  @IsString()
  @Matches(DATE_TIME_RULE, { message: '开始时间格式应为 YYYY-MM-DD HH:mm:ss' })
  @MaxLength(32)
  startsAt?: string | null;

  @ApiPropertyOptional({ description: '生效结束时间，留空表示长期有效', example: '2026-10-18 23:59:59' })
  @IsOptional()
  @IsString()
  @Matches(DATE_TIME_RULE, { message: '结束时间格式应为 YYYY-MM-DD HH:mm:ss' })
  @MaxLength(32)
  endsAt?: string | null;

  @ApiPropertyOptional({ enum: [ActivityStatus.Enabled, ActivityStatus.Disabled] })
  @IsOptional()
  @IsIn([ActivityStatus.Enabled, ActivityStatus.Disabled])
  status?: ActivityStatus;

  @ApiPropertyOptional({ description: '排序值，越小越靠前' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sort?: number;
}

export class UpdateActivityDto extends PartialType(CreateActivityDto) {}

export class ActivityStatusDto {
  @ApiProperty({ enum: [ActivityStatus.Enabled, ActivityStatus.Disabled] })
  @IsIn([ActivityStatus.Enabled, ActivityStatus.Disabled])
  status!: ActivityStatus;
}

export class ActivityQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: Object.values(ActivitySlot) })
  @IsOptional()
  @IsIn(Object.values(ActivitySlot))
  slot?: ActivitySlot;

  @ApiPropertyOptional({ enum: [ActivityStatus.Enabled, ActivityStatus.Disabled] })
  @IsOptional()
  @IsIn([ActivityStatus.Enabled, ActivityStatus.Disabled])
  status?: ActivityStatus;
}
