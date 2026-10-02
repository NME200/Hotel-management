import { Transform } from 'class-transformer';

/**
 * 提交前裁剪首尾空格，配合 @IsNotEmpty 拦住"   "这类看似有值实则为空的名称。
 */
export function Trimmed(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}
