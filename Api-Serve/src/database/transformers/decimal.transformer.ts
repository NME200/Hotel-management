import { ValueTransformer } from 'typeorm';

/**
 * MySQL 的 DECIMAL 经驱动返回字符串，这里统一转成 number，
 * 保证接口出参与前端金额计算一致。
 */
export const decimalTransformer: ValueTransformer = {
  to(value: number | null | undefined): number | null | undefined {
    return value === null || value === undefined ? value : value;
  },
  from(value: string | number | null): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    return typeof value === 'number' ? value : Number.parseFloat(value);
  },
};

export const DECIMAL_COLUMNS = 10;
export const DECIMAL_SCALE = 2;
