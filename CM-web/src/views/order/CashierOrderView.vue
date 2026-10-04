<script setup lang="ts">
import { computed, ref } from 'vue'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Printer, Refresh, Search, Wallet } from '@element-plus/icons-vue'

import { QUERY_KEYS } from '@/api/keys'
import { fetchOrderSummary, fetchOrders, updateOrderStatus } from '@/api/order'
import type { OrderItem, OrderStatus } from '@/api/types/order'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import {
  DINE_TYPE_DICT,
  ORDER_STATUS_DICT,
  ORDER_STATUS_OPTIONS,
  PAY_STATUS_DICT,
  nextOrderStatus,
} from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { useAuthStore } from '@/stores/auth'
import { formatMoney, formatTime, today } from '@/utils/format'
import { useReceiptPrint } from '@/utils/print/use-receipt-print'
import PaginationBar from '@/components/common/PaginationBar.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import SettleDialog from './components/SettleDialog.vue'

const auth = useAuthStore()
const queryClient = useQueryClient()
const { printing, printOrderReceipt } = useReceiptPrint()

const canUpdate = computed(() => auth.can(PERMISSION.orderUpdate))
const canSettle = computed(() => auth.can(PERMISSION.paymentCreate))

const status = ref<OrderStatus | undefined>(undefined)
const keyword = ref('')
const page = ref(DEFAULT_PAGE)
const pageSize = ref(DEFAULT_PAGE_SIZE)

/** 收银台只看今天：昨天的账不在收银员的职责范围内 */
const tradeDate = today()

const queryParams = computed(() => ({
  status: status.value,
  from: tradeDate,
  to: tradeDate,
  page: page.value,
  pageSize: pageSize.value,
}))

const orderQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.orders, 'today', queryParams.value]),
  queryFn: () => fetchOrders(queryParams.value),
  placeholderData: keepPreviousData,
})

const summaryQuery = useQuery({
  queryKey: [...QUERY_KEYS.orderSummary, 'today', tradeDate],
  queryFn: () => fetchOrderSummary({ from: tradeDate, to: tradeDate }),
})

const orders = computed<OrderItem[]>(() => orderQuery.data.value?.list ?? [])
const total = computed(() => orderQuery.data.value?.total ?? 0)

/** 订单号过滤放在本地：一天的订单量很小，本地过滤比再打一次接口快 */
const shownOrders = computed(() => {
  const word = keyword.value.trim().toLowerCase()
  if (!word) return orders.value
  return orders.value.filter((order) => order.orderNo.toLowerCase().includes(word))
})

function handleSearch(): void {
  page.value = DEFAULT_PAGE
}

function handleReset(): void {
  status.value = undefined
  keyword.value = ''
  page.value = DEFAULT_PAGE
}

const statusMutation = useMutation({
  mutationFn: (variables: { id: number; status: OrderStatus; remark?: string }) =>
    updateOrderStatus(variables.id, { status: variables.status, remark: variables.remark }),
  onSuccess: () => {
    ElMessage.success('订单状态已更新')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.orders })
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.orderSummary })
  },
})

function advance(order: OrderItem): void {
  const next = nextOrderStatus(order.status)
  if (!next) return
  statusMutation.mutate({ id: order.id, status: next })
}

async function cancelOrder(order: OrderItem): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认取消订单 ${order.orderNo}？`, '取消订单', {
      confirmButtonText: '确认取消',
      cancelButtonText: '再想想',
      type: 'warning',
    })
  } catch {
    return
  }
  statusMutation.mutate({ id: order.id, status: 'cancelled', remark: '收银台取消' })
}

/* ------------------------------ 收款 ------------------------------ */

const settleVisible = ref(false)
const settleOrder = ref<OrderItem | null>(null)

function openSettle(order: OrderItem): void {
  settleOrder.value = order
  settleVisible.value = true
}

function handlePaid(): void {
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.orders })
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.orderSummary })
}

async function handlePrint(order: OrderItem, ticketType: 'customer' | 'kitchen'): Promise<void> {
  await printOrderReceipt({ orderId: order.id, ticketType, trigger: 'manual' })
}
</script>

<template>
  <div class="orders">
    <div class="orders__head">
      <div class="orders__stats">
        <div class="stat">
          <span class="stat__label">今日单数</span>
          <span class="stat__value">{{ summaryQuery.data.value?.orderCount ?? '--' }}</span>
        </div>
        <div class="stat">
          <span class="stat__label">营业额</span>
          <span class="stat__value stat__value--money">
            {{ summaryQuery.data.value ? formatMoney(summaryQuery.data.value.turnover) : '--' }}
          </span>
        </div>
        <div class="stat">
          <span class="stat__label">待收款</span>
          <span class="stat__value stat__value--warn">{{ summaryQuery.data.value?.unpaidCount ?? '--' }}</span>
        </div>
      </div>

      <el-space wrap>
        <el-select v-model="status" placeholder="全部状态" clearable style="width: 140px" @change="handleSearch">
          <el-option
            v-for="item in ORDER_STATUS_OPTIONS"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <el-input
          v-model="keyword"
          placeholder="订单号"
          clearable
          style="width: 180px"
          @clear="handleSearch"
          @keyup.enter="handleSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button @click="handleReset">重置</el-button>
        <el-button :icon="Refresh" :loading="orderQuery.isFetching.value" @click="orderQuery.refetch()">
          刷新
        </el-button>
      </el-space>
    </div>

    <div class="orders__body">
      <el-table v-loading="orderQuery.isFetching.value" :data="shownOrders" border stripe height="100%">
        <el-table-column label="订单号" min-width="180">
          <template #default="{ row }: { row: OrderItem }">
            <span class="cell-no">{{ row.orderNo }}</span>
            <p class="table-sub-text">{{ formatTime(row.createdAt) }}</p>
          </template>
        </el-table-column>
        <el-table-column label="桌号 / 方式" width="130">
          <template #default="{ row }: { row: OrderItem }">
            <span v-if="row.tableNo">{{ row.tableNo }} 桌</span>
            <span v-else class="text-muted">--</span>
            <p class="table-sub-text">
              {{ DINE_TYPE_DICT[row.dineType]?.label ?? row.dineType }}
              <template v-if="row.dineType === 'dine_in'"> · {{ row.peopleCount }} 人</template>
            </p>
          </template>
        </el-table-column>
        <el-table-column label="菜品" width="90" align="center">
          <template #default="{ row }: { row: OrderItem }">{{ row.itemCount }} 项</template>
        </el-table-column>
        <el-table-column label="金额" width="110" align="right">
          <template #default="{ row }: { row: OrderItem }">
            <span class="cell-amount">{{ formatMoney(row.payAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="支付" width="110" align="center">
          <template #default="{ row }: { row: OrderItem }">
            <StatusTag :item="PAY_STATUS_DICT[row.payStatus]" />
          </template>
        </el-table-column>
        <el-table-column label="出餐" width="110" align="center">
          <template #default="{ row }: { row: OrderItem }">
            <StatusTag :item="ORDER_STATUS_DICT[row.status]" />
          </template>
        </el-table-column>
        <el-table-column label="顾客" min-width="110">
          <template #default="{ row }: { row: OrderItem }">
            <span>{{ row.memberNickname || '散客' }}</span>
            <p v-if="row.pickupCode" class="table-sub-text">取餐码 {{ row.pickupCode }}</p>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right" align="right">
          <template #default="{ row }: { row: OrderItem }">
            <el-button
              v-if="row.payStatus === 'unpaid' && canSettle"
              text
              type="primary"
              :icon="Wallet"
              @click="openSettle(row)"
            >
              收款
            </el-button>
            <el-button text :icon="Printer" :loading="printing" @click="handlePrint(row, 'customer')">
              小票
            </el-button>
            <el-button text @click="handlePrint(row, 'kitchen')">后厨</el-button>
            <el-button
              v-if="canUpdate && nextOrderStatus(row.status)"
              text
              type="primary"
              @click="advance(row)"
            >
              {{ ORDER_STATUS_DICT[nextOrderStatus(row.status)!]?.label }}
            </el-button>
            <el-button
              v-if="canUpdate && (row.status === 'pending' || row.status === 'accepted' || row.status === 'preparing')"
              text
              type="danger"
              @click="cancelOrder(row)"
            >
              取消
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty
            :description="orderQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '今天还没有订单'"
            :image-size="80"
          />
        </template>
      </el-table>
    </div>

    <div class="orders__foot">
      <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" />
    </div>

    <SettleDialog v-model="settleVisible" :order="settleOrder" @paid="handlePaid" />
  </div>
</template>

<style scoped>
.orders {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.orders__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
  flex-shrink: 0;
}

.orders__stats {
  display: flex;
  gap: 28px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat__label {
  font-size: 12px;
  color: #909399;
}

.stat__value {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.stat__value--money {
  color: #f56c6c;
}

.stat__value--warn {
  color: #e6a23c;
}

.orders__body {
  flex: 1;
  min-height: 0;
  padding: 12px 16px 0;
}

.orders__foot {
  display: flex;
  justify-content: flex-end;
  padding: 8px 16px 12px;
  flex-shrink: 0;
}

.cell-no {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-weight: 500;
}

.cell-amount {
  font-weight: 600;
  color: #f56c6c;
}
</style>
