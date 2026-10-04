import dayjs from 'dayjs'

import { DATE_PATTERN, DATETIME_PATTERN, TIME_PATTERN } from '@/constants/date-patterns'

const AMOUNT_FORMATTER = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

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

/** ISO 字符串 -> 本地可读时间 */
export function formatDateTime(value: string | null | undefined, pattern = DATETIME_PATTERN): string {
  if (!value) return '--'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format(pattern) : '--'
}

export function formatDate(value: string | null | undefined): string {
  return formatDateTime(value, DATE_PATTERN)
}

export function formatTime(value: string | null | undefined): string {
  return formatDateTime(value, TIME_PATTERN)
}

/** 今天的日期串，收银台查「今日订单」用 */
export function today(): string {
  return dayjs().format(DATE_PATTERN)
}

/**
 * 用餐时长：从开台时间到此刻，返回「1小时23分」这种口语化文本。
 * 收银台看板要靠它一眼看出哪桌坐太久了。
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

/** 收银台找零：实收 - 应收，负数按 0 处理（前端只做展示，金额以「分」对齐后比较） */
export function changeCents(received: number, payable: number): number {
  const diff = Math.round(received * 100) - Math.round(payable * 100)
  return diff > 0 ? diff / 100 : 0
}
