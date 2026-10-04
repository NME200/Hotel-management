import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import type { CashierOrderItemInput, OrderOptionSelectionInput } from '@/api/types/cashier'
import type { DineType } from '@/api/types/order'

/**
 * 收银台的「当前这一单」。
 *
 * 除了购物车行，还持有就餐方式、桌位、会员这些**开单上下文** ——
 * 它们与菜品是同一次开单的一部分，拆到两个 store 里只会让
 * 「清空购物车时忘了清会员」这类 bug 有机可乘。
 *
 * 这里**不做任何金额计算**：行上只有数量与名称，合计一律由后端的
 * `/merchant/cashier/orders/preview` 算出来。收银台报错价的代价是真实的钱。
 */
export interface CartLine {
  /** dishId + skuId + 加料组合，同菜同规格同加料才合并成一行 */
  key: string
  dishId: number
  name: string
  image: string | null
  skuId: number
  skuName: string
  optionSummary: string
  selections: OrderOptionSelectionInput[]
  quantity: number
}

function lineKey(dishId: number, skuId: number, selections: OrderOptionSelectionInput[]): string {
  const signature = selections
    .map((item) => `${item.groupId}:${[...item.optionNames].sort().join(',')}`)
    .sort()
    .join('|')
  return `${dishId}#${skuId}#${signature}`
}

export const useCartStore = defineStore('cart', () => {
  const lines = ref<CartLine[]>([])

  /* ------------------------------ 开单上下文 ------------------------------ */

  const dineType = ref<DineType>('dine_in')
  /** 堂食必选桌位；非堂食为 null */
  const tableId = ref<number | null>(null)
  const peopleCount = ref(1)
  /** 识别到的会员；为 null 即散客单，不享会员价 */
  const memberId = ref<number | null>(null)
  const memberLabel = ref('')
  const remark = ref('')

  const count = computed(() => lines.value.reduce((total, line) => total + line.quantity, 0))
  const isEmpty = computed(() => lines.value.length === 0)

  /* ------------------------------ 购物车操作 ------------------------------ */

  function addLine(line: Omit<CartLine, 'key'>): void {
    const key = lineKey(line.dishId, line.skuId, line.selections)
    const existing = lines.value.find((item) => item.key === key)
    if (existing) {
      existing.quantity += line.quantity
      return
    }
    lines.value.push({ ...line, key })
  }

  function changeQuantity(key: string, delta: number): void {
    const line = lines.value.find((item) => item.key === key)
    if (!line) return
    const next = line.quantity + delta
    if (next <= 0) {
      lines.value = lines.value.filter((item) => item.key !== key)
      return
    }
    line.quantity = next
  }

  function removeLine(key: string): void {
    lines.value = lines.value.filter((item) => item.key !== key)
  }

  function clearLines(): void {
    lines.value = []
  }

  /** 识别会员：记 ID 与展示名；清掉时一并还原为散客 */
  function setMember(id: number | null, label: string): void {
    memberId.value = id
    memberLabel.value = label
  }

  function chooseDineType(value: DineType): void {
    dineType.value = value
    if (value !== 'dine_in') {
      // 切到自取/外送要立刻丢掉桌位：带着上一桌的桌号开单会把菜送到别人桌上
      tableId.value = null
      peopleCount.value = 1
    }
  }

  /** 整单重置：结账成功或点「清空」时调用 */
  function reset(): void {
    lines.value = []
    tableId.value = null
    peopleCount.value = 1
    memberId.value = null
    memberLabel.value = ''
    remark.value = ''
  }

  /** 转成后端要的菜品行：只报「点了什么」，价格一律不带 */
  function toPayload(): CashierOrderItemInput[] {
    return lines.value.map((line) => {
      const item: CashierOrderItemInput = { dishId: line.dishId, quantity: line.quantity }
      if (line.skuId > 0) item.skuId = line.skuId
      if (line.selections.length > 0) item.optionSelections = line.selections
      return item
    })
  }

  return {
    lines,
    dineType,
    tableId,
    peopleCount,
    memberId,
    memberLabel,
    remark,
    count,
    isEmpty,
    addLine,
    changeQuantity,
    removeLine,
    clearLines,
    setMember,
    chooseDineType,
    reset,
    toPayload,
  }
})
