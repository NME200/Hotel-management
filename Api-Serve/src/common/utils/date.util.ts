/** 解析输入但绝不修改它：addDays 一类的换算如果原地 setDate 会污染调用方的日期对象。 */
function toDate(value: Date | string): Date {
  return typeof value === 'string' ? new Date(`${value}T00:00:00`) : new Date(value.getTime());
}

export function startOfDay(value: Date | string): Date {
  const date = toDate(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfDay(value: Date | string): Date {
  const date = toDate(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function addDays(value: Date | string, days: number): Date {
  const date = toDate(value);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** 本地日期键，形如 2026-10-01，用于趋势图分桶。 */
export function formatDateKey(value: Date | string): string {
  const date = toDate(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
