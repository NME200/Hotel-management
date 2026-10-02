<script setup lang="ts">
import { computed, ref } from 'vue'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, View } from '@element-plus/icons-vue'

import { fetchOrderSummary, fetchOrders, updateOrderStatus } from '@/api/order'
import { QUERY_KEYS } from '@/api/keys'
import type { DineType, OrderBrief, OrderListParams, OrderStatus } from '@/api/types/order'
import { DATE_PATTERN } from '@/constants/date-patterns'
import {
  DINE_TYPE_DICT,
  DINE_TYPE_OPTIONS,
  ORDER_STATUS_DICT,
  ORDER_STATUS_OPTIONS,
  canAdvanceOrder,
  canCancelOrder,
  dictLabel,
  nextOrderStatus,
} from '@/constants/dictionary'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import { PERMISSION } from '@/constants/permission'
import { dateRangeToFromTo, formatDateTime, formatMoney } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import PaginationBar from '@/components/common/PaginationBar.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import OrderSummaryPanel from './components/OrderSummaryPanel.vue'
import OrderDetailDrawer from './components/OrderDetailDrawer.vue'

const authStore = useAuthStore()
const queryClient = useQueryClient()

const keyword = ref('')
const status = ref<OrderStatus | undefined>(undefined)
const dineType = ref<DineType | undefined>(undefined)
const dateRange = ref<[string, string] | null>(null)
const page = ref(DEFAULT_PAGE)
const pageSize = ref(DEFAULT_PAGE_SIZE)

const detailVisible = ref(false)
const detailOrderId = ref<number | null>(null)

const timeRange = computed(() => dateRangeToFromTo(dateRange.value))

const queryParams = computed<OrderListParams>(() => ({
  status: status.value,
  keyword: keyword.value.trim() || undefined,
  dineType: dineType.value,
  from: timeRange.value.from,
  to: timeRange.value.to,
  page: page.value,
  pageSize: pageSize.value,
}))

const orderQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.orders, 'list', queryParams.value]),
  queryFn: () => fetchOrders(queryParams.value),
  enabled: computed(() => authStore.can(PERMISSION.orderRead)),
  placeholderData: keepPreviousData,
})

const summaryQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.orderSummary, timeRange.value]),
  queryFn: () => fetchOrderSummary(timeRange.value),
  enabled: computed(() => authStore.can(PERMISSION.orderRead)),
})

const rows = computed<OrderBrief[]>(() => orderQuery.data.value?.list ?? [])
const total = computed(() => orderQuery.data.value?.total ?? 0)

const statusItem = (row: OrderBrief) => ORDER_STATUS_DICT[row.status]
const dineItem = (row: OrderBrief) => DINE_TYPE_DICT[row.dineType]

const statusMutation = useMutation({
  mutationFn: (variables: { id: number; status: OrderStatus; remark?: string }) =>
    updateOrderStatus(variables.id, { status: variables.status, remark: variables.remark }),
  onSuccess: (_data, variables) => {
    ElMessage.success(`订单已更新为「${dictLabel(ORDER_STATUS_DICT, variables.status)}」`)
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.orders })
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.orderSummary })
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard })
  },
})

function advance(row: OrderBrief): void {
  const next = nextOrderStatus(row.status)
  if (!next) return
  if (!authStore.can(PERMISSION.orderUpdate)) {
    ElMessage.warning('没有订单流转权限')
    return
  }
  statusMutation.mutate({ id: row.id, status: next })
}

async function cancel(row: OrderBrief): Promise<void> {
  if (!authStore.can(PERMISSION.orderUpdate)) {
    ElMessage.warning('没有订单流转权限')
    return
  }
  let remark = ''
  try {
    const result = await ElMessageBox.prompt(
      `确认将订单 ${row.orderNo} 置为已取消？可填写取消原因。`,
      '取消订单',
      {
        inputPlaceholder: '取消原因（可选）',
        confirmButtonText: '确认取消',
        cancelButtonText: '返回',
        inputValidator: (value: string) => value.length <= 200 || '取消原因最多 200 字',
      },
    )
    remark = result.value ?? ''
  } catch {
    return
  }
  statusMutation.mutate({ id: row.id, status: 'cancelled', remark })
}

function openDetail(row: OrderBrief): void {
  detailOrderId.value = row.id
  detailVisible.value = true
}

function handleSearch(): void {
  page.value = DEFAULT_PAGE
}

function handleReset(): void {
  keyword.value = ''
  status.value = undefined
  dineType.value = undefined
  dateRange.value = null
  page.value = DEFAULT_PAGE
}
</script>

<template>
  <div class="page-container">
    <OrderSummaryPanel :summary="summaryQuery.data.value" :loading="summaryQuery.isFetching.value" />

    <div class="page-card">
      <div class="page-toolbar">
        <el-space wrap :size="12">
          <el-input
            v-model="keyword"
            placeholder="订单号 / 取餐码 / 会员"
            clearable
            class="toolbar-input"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select v-model="status" placeholder="全部状态" clearable class="toolbar-select" @change="handleSearch">
            <el-option
              v-for="item in ORDER_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <el-select v-model="dineType" placeholder="全部就餐方式" clearable class="toolbar-select" @change="handleSearch">
            <el-option
              v-for="item in DINE_TYPE_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            unlink-panels
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            :value-format="DATE_PATTERN"
            class="toolbar-date"
            @change="handleSearch"
          />
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-space>
        <el-button @click="orderQuery.refetch()">
          <el-icon><Refresh /></el-icon>
          <span>刷新</span>
        </el-button>
      </div>

      <el-table v-loading="orderQuery.isFetching.value" :data="rows" border stripe class="order-table">
        <el-table-column label="订单" min-width="200">
          <template #default="{ row }: { row: OrderBrief }">
            <div class="cell-order">
              <div class="cell-text">
                <span class="cell-no text-ellipsis">{{ row.orderNo }}</span>
                <p class="table-sub-text">{{ formatDateTime(row.createdAt) }}</p>
              </div>
              <el-tag v-if="row.pickupCode" size="small" type="warning" effect="plain">
                {{ row.pickupCode }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="就餐方式" width="110" align="center">
          <template #default="{ row }: { row: OrderBrief }">
            <div class="cell-dine">
              <StatusTag :item="dineItem(row)" />
              <p v-if="row.dineType === 'dine_in'" class="table-sub-text">
                {{ row.tableNo || '--' }} 桌 / {{ row.peopleCount }} 人
              </p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="会员" min-width="120">
          <template #default="{ row }: { row: OrderBrief }">
            <span v-if="row.memberNickname">{{ row.memberNickname }}</span>
            <span v-else class="text-muted">散客</span>
          </template>
        </el-table-column>
        <el-table-column label="菜品" width="90" align="center">
          <template #default="{ row }: { row: OrderBrief }">{{ row.itemCount }} 件</template>
        </el-table-column>
        <el-table-column label="实付" width="120" align="right">
          <template #default="{ row }: { row: OrderBrief }">
            <div class="cell-amount">
              <span class="cell-pay">{{ formatMoney(row.payAmount) }}</span>
              <p v-if="row.discountAmount > 0" class="table-sub-text">优惠 {{ formatMoney(row.discountAmount) }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }: { row: OrderBrief }">
            <StatusTag :item="statusItem(row)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right" align="right">
          <template #default="{ row }: { row: OrderBrief }">
            <el-button text type="primary" @click="openDetail(row)">
              <el-icon><View /></el-icon>
              <span>详情</span>
            </el-button>
            <el-button
              v-if="canAdvanceOrder(row.status)"
              text
              type="success"
              :disabled="!authStore.can(PERMISSION.orderUpdate) || statusMutation.isPending.value"
              @click="advance(row)"
            >
              <span>{{ `流转为${dictLabel(ORDER_STATUS_DICT, nextOrderStatus(row.status))}` }}</span>
            </el-button>
            <el-button
              v-if="canCancelOrder(row.status)"
              text
              type="danger"
              :disabled="!authStore.can(PERMISSION.orderUpdate) || statusMutation.isPending.value"
              @click="cancel(row)"
            >
              <span>取消</span>
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty
            :description="orderQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '暂无订单'"
            :image-size="80"
          />
        </template>
      </el-table>

      <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" />
    </div>

    <OrderDetailDrawer v-model="detailVisible" :order-id="detailOrderId" />
  </div>
</template>

<style scoped>
.toolbar-input {
  width: 200px;
}

.toolbar-select {
  width: 140px;
}

.toolbar-date {
  width: 260px;
}

.order-table {
  padding: 0 16px;
}

.cell-order,
.cell-dine,
.cell-amount {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.cell-order {
  flex-direction: row;
  gap: 8px;
  align-items: center;
}

.cell-no {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-weight: 500;
}

.cell-dine {
  align-items: center;
}

.cell-amount {
  align-items: flex-end;
}

.cell-pay {
  font-weight: 600;
  color: #f56c6c;
}
</style>
