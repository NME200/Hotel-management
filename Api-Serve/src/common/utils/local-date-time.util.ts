import { BusinessException } from '../exceptions/business.exception';

/** 本地墙上时钟格式：YYYY-MM-DD [HH:mm[:ss]] */
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * 商户手填的时间按本地时区解析。
 *
 * `new Date('2026-10-08 00:00:00')` 在不同引擎下会当成 UTC，界面选 0 点、库里存 8 点，
 * 生效判断就会整整差一个时区，所以本地格式一律手写解析。
 */
export function parseLocalDateTime(value: string | null | undefined): Date | null {
  const input = value?.trim();
  if (!input) {
    return null;
  }

  const matched = LOCAL_DATE_TIME.exec(input);
  if (matched) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = matched;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw BusinessException.badRequest(`时间格式不正确：${input}`);
  }
  return parsed;
}
