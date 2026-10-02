import { randomInt } from 'node:crypto';

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

/** 订单号：日期 + 时间 + 6 位随机数，日内基本不冲突，唯一索引兜底。 */
export function generateOrderNo(date: Date = new Date()): string {
  const y = date.getFullYear();
  const stamp = `${pad(y % 100, 2)}${pad(date.getMonth() + 1, 2)}${pad(date.getDate(), 2)}`;
  const time = `${pad(date.getHours(), 2)}${pad(date.getMinutes(), 2)}${pad(date.getSeconds(), 2)}`;
  return `${stamp}${time}${pad(randomInt(0, 1_000_000), 6)}`;
}

/** 取餐码：4 位数字，商户内按天去重由服务层保证。 */
export function generatePickupCode(): string {
  return pad(randomInt(0, 10_000), 4);
}

/** 取餐码重试用次数：4 位数字在同一商户同一天里理论上会撞。 */
export const PICKUP_CODE_RETRY = 20;

/** 商户支付单号（out_trade_no）：前缀 + 时间戳 + 随机数，全局唯一。 */
export function generatePaymentNo(date: Date = new Date()): string {
  return `P${generateOrderNo(date)}`;
}

/** 商户退款单号（out_refund_no）。 */
export function generateRefundNo(date: Date = new Date()): string {
  return `R${generateOrderNo(date)}`;
}

/** 分账单号（渠道侧 profit_sharing 的 out_order_no）。 */
export function generateShareNo(date: Date = new Date()): string {
  return `S${generateOrderNo(date)}`;
}

/** 对账单号（每商户每渠道每日一份）。 */
export function generateReconcileNo(date: Date = new Date()): string {
  return `C${generateOrderNo(date)}`;
}

/** 会员券号：CP 前缀，与支付/对账单号区分开，顾客截图客服能一眼认出是券。 */
export function generateCouponNo(date: Date = new Date()): string {
  return `CP${generateOrderNo(date)}`;
}
