<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { ElMessage } from 'element-plus'
import { Printer, Refresh, Search } from '@element-plus/icons-vue'

import { QUERY_KEYS } from '@/api/keys'
import { fetchCategories, fetchDishes } from '@/api/order'
import { fetchTables } from '@/api/table'
import type { CashierOrderView } from '@/api/types/cashier'
import type { DishItem } from '@/api/types/order'
import { useCartStore } from '@/stores/cart'
import { useReceiptPrint } from '@/utils/print/use-receipt-print'
import CartPanel from './components/CartPanel.vue'
import CheckoutDialog from './components/CheckoutDialog.vue'
import DishOptionDialog from './components/DishOptionDialog.vue'

const cart = useCartStore()
const { printing, printOrderReceipt } = useReceiptPrint()

const categoryQuery = useQuery({
  queryKey: QUERY_KEYS.categories,
  queryFn: () => fetchCategories(),
})

const dishQuery = useQuery({
  queryKey: [...QUERY_KEYS.dishes, 'pos'],
  queryFn: () => fetchDishes({}),
})

const tableQuery = useQuery({
  queryKey: QUERY_KEYS.tables,
  queryFn: () => fetchTables(),
})

const activeCategoryId = ref(0)
const keyword = ref('')

const categories = computed(() => categoryQuery.data.value ?? [])
const allDishes = computed(() => dishQuery.data.value ?? [])
const tables = computed(() => tableQuery.data.value ?? [])

const shownDishes = computed<DishItem[]>(() => {
  const word = keyword.value.trim().toLowerCase()
  return allDishes.value.filter((dish) => {
    if (activeCategoryId.value > 0 && dish.categoryId !== activeCategoryId.value) return false
    if (word && !dish.name.toLowerCase().includes(word)) return false
    return true
  })
})

/** 每个分类的在售数量，让收银员知道该点哪个分类 */
function dishCountOf(categoryId: number): number {
  return allDishes.value.filter((dish) => dish.categoryId === categoryId).length
}

/* ------------------------------ 加菜 ------------------------------ */

const optionDialogVisible = ref(false)
const optionDish = ref<DishItem | null>(null)

function handlePickDish(dish: DishItem): void {
  if (dish.status !== 'on_sale') {
    ElMessage.warning(`「${dish.name}」已停售`)
    return
  }
  if (dish.stockType === 'fixed' && (dish.stock ?? 0) <= 0) {
    ElMessage.warning(`「${dish.name}」已售罄`)
    return
  }

  // 有规格或加料的菜必须先选清楚：直接加购会把「大份加辣」记成基础份，
  // 后厨按错的规格做菜，退菜的成本远高于多一次点击。
  if (dish.needChoose) {
    optionDish.value = dish
    optionDialogVisible.value = true
    return
  }

  cart.addLine({
    dishId: dish.id,
    name: dish.name,
    image: dish.image,
    skuId: -1,
    skuName: '',
    optionSummary: '',
    selections: [],
    quantity: 1,
  })
}

/* ------------------------------ 结账 ------------------------------ */

const checkoutVisible = ref(false)
const paidOrder = ref<CashierOrderView | null>(null)
const printVisible = ref(false)

function handlePaid(order: CashierOrderView): void {
  paidOrder.value = order
  printVisible.value = true
}

async function handlePrint(ticketType: 'customer' | 'kitchen'): Promise<void> {
  const order = paidOrder.value
  if (!order) return
  await printOrderReceipt({ orderId: order.id, ticketType, trigger: 'manual' })
  printVisible.value = false
}

function refreshAll(): void {
  void categoryQuery.refetch()
  void dishQuery.refetch()
  void tableQuery.refetch()
}
</script>

<template>
  <div class="pos-root">
    <div class="pos-main">
      <!-- 左：分类 -->
      <div class="pos-col rail">
        <div class="rail__head">分类</div>
        <div class="pos-scroll">
          <button
            type="button"
            class="rail__item"
            :class="{ 'rail__item--on': activeCategoryId === 0 }"
            @click="activeCategoryId = 0"
          >
            <span class="rail__name">全部</span>
            <span class="rail__count">{{ allDishes.length }}</span>
          </button>
          <button
            v-for="category in categories"
            :key="category.id"
            type="button"
            class="rail__item"
            :class="{ 'rail__item--on': activeCategoryId === category.id }"
            @click="activeCategoryId = category.id"
          >
            <span class="rail__name text-ellipsis">{{ category.name }}</span>
            <span class="rail__count">{{ dishCountOf(category.id) }}</span>
          </button>
        </div>
      </div>

      <!-- 中：菜品 -->
      <div class="pos-col menu">
        <div class="menu__head">
          <el-input v-model="keyword" placeholder="搜索菜品" clearable class="menu__search">
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-button :icon="Refresh" :loading="dishQuery.isFetching.value" @click="refreshAll">刷新</el-button>
        </div>

        <div v-loading="dishQuery.isFetching.value" class="pos-scroll menu__body">
          <div v-if="shownDishes.length === 0" class="menu__empty">
            <p>这个分类下没有菜品</p>
            <p class="text-muted">换个分类或清空搜索词试试</p>
          </div>
          <div class="grid">
            <button
              v-for="dish in shownDishes"
              :key="dish.id"
              type="button"
              class="dish"
              :class="{ 'dish--off': dish.status !== 'on_sale' }"
              @click="handlePickDish(dish)"
            >
              <div class="dish__thumb">
                <img v-if="dish.image" :src="dish.image" :alt="dish.name" />
                <span v-else class="dish__char">{{ dish.name.slice(0, 1) }}</span>
                <span v-if="dish.stockType === 'fixed' && (dish.stock ?? 0) <= 0" class="dish__mask">售罄</span>
              </div>
              <div class="dish__name text-ellipsis">{{ dish.name }}</div>
              <div class="dish__price">
                <span>{{ `¥${dish.price}` }}</span>
                <span v-if="dish.memberPrice !== null" class="dish__member">会员 ¥{{ dish.memberPrice }}</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      <!-- 右：本单 -->
      <div class="pos-col cart-col">
        <CartPanel :tables="tables" @checkout="checkoutVisible = true" />
      </div>
    </div>

    <DishOptionDialog v-model="optionDialogVisible" :dish="optionDish" />
    <CheckoutDialog v-model="checkoutVisible" @paid="handlePaid" />

    <!-- 收款后立刻问要不要打票：收银台最顺手的顺序就是「收完钱就出票」 -->
    <el-dialog v-model="printVisible" title="收款完成，是否打印小票？" width="420px">
      <div class="paid">
        <p class="paid__line">
          订单号 <b>{{ paidOrder?.orderNo }}</b>
        </p>
        <p class="paid__line">
          金额 <b class="paid__amount">{{ paidOrder ? `¥${paidOrder.payAmount}` : '--' }}</b>
        </p>
        <p v-if="paidOrder?.tableNo" class="paid__line">
          桌号 <b>{{ paidOrder.tableNo }}</b>
        </p>
      </div>
      <template #footer>
        <el-button @click="printVisible = false">不打票</el-button>
        <el-button :icon="Printer" :loading="printing" @click="handlePrint('kitchen')">打后厨票</el-button>
        <el-button
          type="primary"
          :icon="Printer"
          :loading="printing"
          @click="handlePrint('customer')"
        >
          打顾客小票
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.rail {
  width: 168px;
  flex-shrink: 0;
}

.rail__head,
.menu__head {
  padding: 10px 12px;
  border-bottom: 1px solid #ebeef5;
  font-size: 13px;
  font-weight: 500;
  color: #303133;
}

.rail__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  padding: 11px 12px;
  border: none;
  border-left: 3px solid transparent;
  background: transparent;
  font-size: 14px;
  color: #606266;
  text-align: left;
  cursor: pointer;
}

.rail__item:hover {
  background: #f5f7fa;
}

.rail__item--on {
  border-left-color: var(--cm-brand);
  background: #eef2ff;
  color: var(--cm-brand);
  font-weight: 500;
}

.rail__name {
  min-width: 0;
}

.rail__count {
  font-size: 12px;
  color: #a8abb2;
}

.menu {
  flex: 1;
  min-width: 0;
}

.menu__head {
  display: flex;
  gap: 10px;
}

.menu__search {
  max-width: 260px;
}

.menu__body {
  padding: 12px;
}

.menu__empty {
  padding: 48px 0;
  text-align: center;
  font-size: 13px;
  color: #606266;
}

.menu__empty .text-muted {
  margin-top: 6px;
  font-size: 12px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 10px;
}

.dish {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid #ebeef5;
  border-radius: var(--cm-radius);
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.dish:hover {
  border-color: var(--cm-brand);
  box-shadow: 0 2px 10px rgb(79 124 255 / 16%);
}

.dish--off {
  opacity: 0.55;
}

.dish__thumb {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88px;
  overflow: hidden;
  border-radius: 6px;
  background: #f5f7fa;
}

.dish__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dish__char {
  font-size: 26px;
  font-weight: 600;
  color: var(--cm-brand);
}

.dish__mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #fff;
  background: rgb(0 0 0 / 45%);
}

.dish__name {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
}

.dish__price {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
  color: #f56c6c;
}

.dish__member {
  font-size: 11px;
  font-weight: 400;
  color: #e6a23c;
}

.cart-col {
  width: 360px;
  flex-shrink: 0;
}

.paid {
  padding: 4px 0;
}

.paid__line {
  margin: 6px 0;
  font-size: 14px;
  color: #606266;
}

.paid__amount {
  font-size: 20px;
  color: #f56c6c;
}
</style>
