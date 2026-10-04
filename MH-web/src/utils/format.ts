import dayjs from 'dayjs'

import { DATE_PATTERN, DATETIME_PATTERN } from '@/constants/date-patterns'

const AMOUNT_FORMATTER = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const INTEGER_FORMATTER = new Intl.NumberFormat('zh-CN')

/** 金额保留两位小数（千分位），非法值兜底为 0.00 */
export function formatAmount(value: number | string | null | undefined): string {
  const amount = typeof value === 'string' ? Number.parseFloat(value) : value
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '0.00'
  return AMOUNT_FORMATTER.format(amount)
}

/** 带币符的金额 */
export function formatMoney(value: number | string | null | undefined): string {
  return `¥${formatAmount(value)}`
}

/** 整数计数（订单数、销量等） */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '0'
  return INTEGER_FORMATTER.format(value)
}

/** 费率小数转百分比展示：0.006 -> 0.6%，空值返回 '--' */
export function formatRate(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--'
  // 0.006 * 100 在浮点下会得到 0.6000000000000001，先收敛再拼接
  const percent = Number((value * 100).toFixed(6))
  return `${percent}%`
}

/** 与上期对比的增长百分比；上期为 0 时无法计算，返回 null 由页面展示「--」 */
export function growthRate(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null
  return ((current - previous) / previous) * 100
}

/**
 * 环比文案：入参是 `growthRate` 的结果（已经是百分数）。
 * 与上面的 `formatRate` 不是一回事，那个吃的是费率小数，故这里另起一个名字。
 */
export function formatGrowth(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '--'
  if (Math.abs(rate) < 0.05) return '持平'
  return `${Math.abs(rate).toFixed(1)}%`
}

/** ISO 字符串 -> 本地可读时间 */
export function formatDateTime(value: string | null | undefined, pattern = DATETIME_PATTERN): string {
  if (!value) return '--'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format(pattern) : '--'
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '--'
  return formatDateTime(value, DATE_PATTERN)
}

/** 2026-09-25 -> 09-25，用于趋势图 X 轴 */
export function shortDate(value: string): string {
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('MM-DD') : value
}

/**
 * 把 el-date-picker 的日期区间转成后端需要的 ISO from / to。
 * from 取区间首日 00:00:00，to 取末日 23:59:59。
 */
export function dateRangeToFromTo(range: [string, string] | null | undefined): { from?: string; to?: string } {
  if (!range || range.length !== 2 || !range[0] || !range[1]) return {}
  const from = dayjs(range[0])
  const to = dayjs(range[1])
  if (!from.isValid() || !to.isValid()) return {}
  return {
    from: from.startOf('day').toISOString(),
    to: to.endOf('day').toISOString(),
  }
}

/**
 * 用餐时长：开台时间到现在，取整分钟。
 * 「1 小时 5 分」比「11:03 开台」更好读，收银台与桌位管理用同一种说法。
 */
export function diningDuration(openedAt: string | null | undefined): string {
  if (!openedAt) return '--'
  const start = dayjs(openedAt)
  if (!start.isValid()) return '--'
  const minutes = Math.max(dayjs().diff(start, 'minute'), 0)
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`
}
