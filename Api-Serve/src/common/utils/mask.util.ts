/** 手机号展示脱敏：138****5678。空值原样返回，调用方不必再判空。 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) {
    return null;
  }
  const digits = phone.trim();
  if (digits.length < 7) {
    return '****';
  }
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}
