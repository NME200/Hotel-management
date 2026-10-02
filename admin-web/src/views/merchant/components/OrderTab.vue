<script setup lang="ts">
import { computed, ref } from 'vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { Refresh, Search } from '@element-plus/icons-vue'

import { fetchMerchantOrders } from '@/api/merchant-insight'
import { QUERY_KEYS } from '@/api/keys'
import type {
  DineType,
  OrderStatus,
  PlatformOrder,
  PlatformOrderItem,
  PlatformOrderListParams,
} from '@/api/types/merchant-insight'
import { DATE_PATTERN } from '@/constants/date-patterns'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import { DINE_TYPE_DICT, DINE_TYPE_OPTIONS, ORDER_STATUS_DICT, ORDER_STATUS_OPTIONS } from '@/constants/dictionary'
import { dateRangeToFromTo, formatDateTime, formatMoney } from '@/utils/format'
import PaginationBar from '@/components/common/PaginationBar.vue'
import StatusTag from '@/components/common/StatusTag.vue'

const props = defineProps<{ merchantId: number }>()

const keyword = ref('')
const status = ref<OrderStatus | undefined>(undefined)
const dineType = ref<DineType | undefined>(undefined)
const dateRange = ref<[string, string] | null>(null)
const page = ref(DEFAULT_PAGE)
const pageSize = ref(DEFAULT_PAGE_SIZE)

const timeRange = computed(() => dateRangeToFromTo(dateRange.value))

const queryParams = computed<PlatformOrderListParams>(() => ({
  keyword: keyword.value.trim() || undefined,
  status: status.value,
  dineType: dineType.value,
  from: timeRange.value.from,
  to: timeRange.value.to,
  page: page.value,
  pageSize: pageSize.value,
}))

const orderQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.merchantInsight, props.merchantId, 'orders', queryParams.value]),
  queryFn: () => fetchMerchantOrders(props.merchantId, queryParams.value),
  enabled: computed(() => props.merchantId > 0),
  placeholderData: keepPreviousData,
})

const rows = computed<PlatformOrder[]>(() => orderQuery.data.value?.list ?? [])
const total = computed(() => orderQuery.data.value?.total ?? 0)

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
  <div class="order-tab">
    <div class="order-tab__toolbar">
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
          <el-option v-for="item in ORDER_STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="dineType" placeholder="全部就餐方式" clearable class="toolbar-select" @change="handleSearch">
          <el-option v-for="item in DINE_TYPE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
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

    <el-table v-loading="orderQuery.isFetching.value" :data="rows" border stripe size="small" row-key="id">
      <el-table-column type="expand">
        <template #default="{ row }: { row: PlatformOrder }">
          <div class="order-expand">
            <el-table :data="row.items" border size="small">
              <el-table-column label="菜品" min-width="200">
                <template #default="{ row: item }: { row: PlatformOrderItem }">
                  <div class="cell-item">
                    <el-image v-if="item.dishImage" :src="item.dishImage" fit="cover" class="cell-item__thumb">
                      <template #error>
                        <div class="cell-item__thumb cell-item__thumb--broken">图</div>
                      </template>
                    </el-image>
                    <div class="cell-text">
                      <span class="text-ellipsis">{{ item.dishName }}</span>
                      <p v-if="item.specDesc" class="table-sub-text">规格：{{ item.specDesc }}</p>
                      <p v-if="item.remark" class="table-sub-text">备注：{{ item.remark }}</p>
                    </div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="单价" width="100" align="right">
                <template #default="{ row: item }: { row: PlatformOrderItem }">{{ formatMoney(item.unitPrice) }}</template>
              </el-table-column>
              <el-table-column label="数量" width="80" align="center">
                <template #default="{ row: item }: { row: PlatformOrderItem }">×{{ item.quantity }}</template>
              </el-table-column>
              <el-table-column label="小计" width="110" align="right">
                <template #default="{ row: item }: { row: PlatformOrderItem }">{{ formatMoney(item.totalAmount) }}</template>
              </el-table-column>
              <template #empty>
                <el-empty description="该订单无菜品明细" :image-size="52" />
              </template>
            </el-table>

            <div class="order-expand__meta">
              <el-descriptions :column="2" border size="small" class="order-expand__desc">
                <el-descriptions-item label="下单时间">{{ formatDateTime(row.createdAt) }}</el-descriptions-item>
                <el-descriptions-item label="接单时间">
                  {{ row.acceptedAt ? formatDateTime(row.acceptedAt) : '未接单' }}
                </el-descriptions-item>
                <el-descriptions-item label="完成时间">
                  {{ row.completedAt ? formatDateTime(row.completedAt) : '未完成' }}
                </el-descriptions-item>
                <el-descriptions-item label="顾客备注">{{ row.remark || '无' }}</el-descriptions-item>
              </el-descriptions>

              <div class="order-expand__amounts">
                <div class="order-expand__row">
                  <span>菜品金额</span><span>{{ formatMoney(row.dishAmount) }}</span>
                </div>
                <div class="order-expand__row">
                  <span>打包费</span><span>{{ formatMoney(row.packingAmount) }}</span>
                </div>
                <div class="order-expand__row">
                  <span>配送费</span><span>{{ formatMoney(row.deliveryAmount) }}</span>
                </div>
                <div class="order-expand__row order-expand__row--discount">
                  <span>优惠金额</span><span>-{{ formatMoney(row.discountAmount) }}</span>
                </div>
                <div class="order-expand__row order-expand__row--total">
                  <span>实付金额</span><span>{{ formatMoney(row.payAmount) }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="订单" min-width="190">
        <template #default="{ row }: { row: PlatformOrder }">
          <div class="cell-order">
            <div class="cell-text">
              <span class="table-mono text-ellipsis">{{ row.orderNo }}</span>
              <p class="table-sub-text">{{ formatDateTime(row.createdAt) }}</p>
            </div>
            <el-tag v-if="row.pickupCode" size="small" type="warning" effect="plain">{{ row.pickupCode }}</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="就餐方式" width="120" align="center">
        <template #default="{ row }: { row: PlatformOrder }">
          <div class="cell-center">
            <StatusTag :item="DINE_TYPE_DICT[row.dineType]" />
            <p v-if="row.dineType === 'dine_in'" class="table-sub-text">
              {{ row.tableNo || '--' }} 桌 / {{ row.peopleCount }} 人
            </p>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="会员" min-width="110">
        <template #default="{ row }: { row: PlatformOrder }">
          <span v-if="row.memberNickname">{{ row.memberNickname }}</span>
          <span v-else class="text-muted">散客</span>
        </template>
      </el-table-column>
      <el-table-column label="菜品" width="80" align="center">
        <template #default="{ row }: { row: PlatformOrder }">{{ row.itemCount }} 件</template>
      </el-table-column>
      <el-table-column label="实付" width="110" align="right">
        <template #default="{ row }: { row: PlatformOrder }">
          <span class="cell-pay">{{ formatMoney(row.payAmount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }: { row: PlatformOrder }">
          <StatusTag :item="ORDER_STATUS_DICT[row.status]" />
        </template>
      </el-table-column>
      <template #empty>
        <el-empty
          :description="orderQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '该商户暂无订单'"
          :image-size="60"
        />
      </template>
    </el-table>

    <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" />
  </div>
</template>

<style scoped>
.order-tab {
  display: flex;
  flex-direction: column;
}

.order-tab__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.toolbar-input {
  width: 180px;
}

.toolbar-select {
  width: 120px;
}

.toolbar-date {
  width: 240px;
}

.cell-order {
  display: flex;
  gap: 8px;
  align-items: center;
}

.cell-center {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
}

.cell-pay {
  font-weight: 600;
  color: #f56c6c;
}

.order-expand {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px;
  background: #f8fafd;
}

.order-expand__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
}

.order-expand__desc {
  flex: 1;
  min-width: 320px;
}

.order-expand__amounts {
  width: 260px;
}

.order-expand__row {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
  font-size: 13px;
  color: #606266;
}

.order-expand__row--discount {
  color: #67c23a;
}

.order-expand__row--total {
  padding-top: 6px;
  margin-top: 4px;
  font-size: 14px;
  font-weight: 600;
  color: #f56c6c;
  border-top: 1px solid #eef1f6;
}

.cell-item {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.cell-item__thumb {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 6px;
}

.cell-item__thumb--broken {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #c0c4cc;
  background: #f4f6fa;
  border: 1px dashed #dcdfe6;
}
</style>
