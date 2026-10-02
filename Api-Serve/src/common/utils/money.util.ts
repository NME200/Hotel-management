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
