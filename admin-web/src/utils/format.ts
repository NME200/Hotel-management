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

/** 整数计数（商户数、订单数等） */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '0'
  return INTEGER_FORMATTER.format(value)
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

/** 与上期对比的增长百分比；上期为 0 时无法计算，返回 null 由页面展示「--」 */
export function growthRate(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null
  return ((current - previous) / previous) * 100
}

export function formatRate(rate: number | null): string {
  if (rate === null || Number.isNaN(rate)) return '--'
  const abs = Math.abs(rate)
  if (abs < 0.05) return '持平'
  return `${abs.toFixed(1)}%`
}

/**
 * 渠道费率与平台抽佣：后端下发小数（0.006 / 0.0038），展示为百分数。
 * 与 growthRate 用的 formatRate 语义不同，那个收到的已经是百分比数值。
 */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--'
  return `${Number((value * 100).toFixed(4))}%`
}

/** 审计详情等对象字段的可读 JSON 文本 */
export function formatJson(value: unknown): string {
  if (value === null || value === undefined) return '无'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
