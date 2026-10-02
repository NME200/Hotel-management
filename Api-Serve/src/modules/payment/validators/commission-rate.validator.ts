import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/** 平台抽佣比例上限：10%。餐饮 SaaS 抽佣普遍在 0.2%~1%，10% 已是很宽的天花板。 */
export const MAX_COMMISSION_RATE = 0.1;

/** 下限 0 表示「已定价为不抽佣」，与「未定价」（字段为 null）是两回事。 */
export const MIN_COMMISSION_RATE = 0;

/**
 * 抽佣比例校验：0 ~ 10%，最多 4 位小数（与 merchant_payment_config.profit_share_rate
 * 的 decimal(6,4) 精度对齐，避免出现存进去被静默截断的值）。
 *
 * 允许 null —— 语义是「清除抽佣」，由调用方按需处理。
 */
export function IsCommissionRate(options?: ValidationOptions): PropertyDecorator {
  return function (target: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'isCommissionRate',
      target: target.constructor,
      propertyName: propertyName as string,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (value === null || value === undefined) {
            return true;
          }
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            return false;
          }
          if (value < MIN_COMMISSION_RATE || value > MAX_COMMISSION_RATE) {
            return false;
          }
          // 小数位不超过 4 位，否则 decimal(6,4) 会静默截断出与界面不一致的值
          const decimals = (String(value).split('.')[1] ?? '').length;
          return decimals <= 4;
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} 必须是 0 ~ ${MAX_COMMISSION_RATE} 之间、最多 4 位小数的比例`;
        },
      },
    });
  };
}
