/**
 * 金额统一以「分」为单位用整数存储与计算：
 * 数据库里的 decimal(10,2) 只用于展示，进渠道的报文一律是整数分，
 * 避免浮点误差在退款和对账时凑不出平。
 */
export function toCents(yuan: number | string | null | undefined): number {
  if (yuan === null || yuan === undefined || yuan === '') {
    return 0;
  }
  const value = typeof yuan === 'number' ? yuan : Number.parseFloat(yuan);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 100);
}

export function toYuan(cents: number | null | undefined): number {
  return Math.round((cents ?? 0)) / 100;
}

/**
 * 把整数「分」格式化成给人看的金额文本（`¥12.30`）。
 *
 * 只用于**渲染小票、短信、导出**这类展示场景：参与任何计算一律继续用分，
 * 小数一旦回流进计算就是浮点误差的入口。
 */
export function formatCents(cents: number | null | undefined): string {
  const value = Math.round(cents ?? 0);
  const negative = value < 0;
  const absolute = Math.abs(value);
  const integer = Math.floor(absolute / 100);
  const fraction = `${absolute % 100}`.padStart(2, '0');
  return `${negative ? '-' : ''}¥${integer}.${fraction}`;
}
