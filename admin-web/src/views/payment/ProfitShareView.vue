<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { CircleCheck, Coin, Lock, Money, Refresh, Search, Unlock, Warning } from '@element-plus/icons-vue'

import {
  fetchPlatformProfitShareDetail,
  fetchPlatformProfitShares,
  fetchPlatformProfitShareSummary,
} from '@/api/payment'
import { QUERY_KEYS } from '@/api/keys'
import type {
  PaymentChannel,
  PlatformProfitShareItem,
  PlatformProfitShareListParams,
  ProfitShareStatus,
} from '@/api/types/payment'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import {
  PAYMENT_CHANNEL_DICT,
  PAYMENT_CHANNEL_OPTIONS,
  PROFIT_SHARE_STATUS_DICT,
  PROFIT_SHARE_STATUS_OPTIONS,
  dictLabel,
  isOpenProfitShare,
} from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { formatCount, formatDateTime, formatMoney } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import PaginationBar from '@/components/common/PaginationBar.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import TimeText from '@/components/common/TimeText.vue'
import type { Component } from 'vue'

interface SummaryCard {
  key: string
  label: string
  value: string
  color: string
  icon: Component
  hint?: string
}

const route = useRoute()
const authStore = useAuthStore()

const canRead = computed(() => authStore.can(PERMISSION.paymentRead))

/** 只在 merchantId 从商户详情带进来时生效，口径与支付流水页一致 */
function initialMerchantId(): number | undefined {
  const value = Number(route.query.merchantId)
  return Number.isInteger(value) && value > 0 ? value : undefined
}

const keyword = ref('')
const channel = ref<PaymentChannel | undefined>()
const status = ref<ProfitShareStatus | undefined>()
const orderNo = ref('')
const merchantId = ref<number | undefined>(initialMerchantId())
const dateRange = ref<[string, string] | null>(null)
const page = ref(DEFAULT_PAGE)
const pageSize = ref(DEFAULT_PAGE_SIZE)

/** 起止日期取本地日（YYYY-MM-DD），后端按天首尾截断，避免时区串天 */
function dayKey(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  const year = parsed.getFullYear()
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsed.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const rangeParams = computed<{ from?: string; to?: string }>(() => {
  const range = dateRange.value
  if (!range || range.length !== 2 || !range[0] || !range[1]) return {}
  return { from: dayKey(range[0]), to: dayKey(range[1]) }
})

const listParams = computed<PlatformProfitShareListParams>(() => ({
  keyword: keyword.value.trim() || undefined,
  orderNo: orderNo.value.trim() || undefined,
  channel: channel.value,
  status: status.value,
  merchantId: merchantId.value,
  page: page.value,
  pageSize: pageSize.value,
  ...rangeParams.value,
}))

const listQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.platformProfitShares, 'list', listParams.value]),
  queryFn: () => fetchPlatformProfitShares(listParams.value),
  enabled: canRead,
  placeholderData: keepPreviousData,
})

const summaryQuery = useQuery({
  queryKey: [...QUERY_KEYS.platformProfitShares, 'summary'],
  queryFn: () => fetchPlatformProfitShareSummary(),
  enabled: canRead,
})

const rows = computed<PlatformProfitShareItem[]>(() => listQuery.data.value?.list ?? [])
const total = computed(() => listQuery.data.value?.total ?? 0)

const summaryCards = computed<SummaryCard[]>(() => {
  const data = summaryQuery.data.value
  return [
    {
      key: 'today',
      label: '今日抽佣',
      value: formatMoney(data?.todayCommission ?? 0),
      color: '#4f7cff',
      icon: Money,
      hint: '按平台侧分账单生成时间统计',
    },
    {
      key: 'total',
      label: '累计抽佣',
      value: formatMoney(data?.totalCommission ?? 0),
      color: '#67c23a',
      icon: CircleCheck,
      hint: '服务商模式下平台自留金额',
    },
    {
      key: 'pending',
      label: '待解冻',
      value: formatCount(data?.pendingCount ?? 0),
      color: '#e6a23c',
      icon: Lock,
      hint: `已冻结 ${formatCount(data?.frozenCount ?? 0)} 笔，T+1 自动解冻`,
    },
    {
      key: 'unfrozen',
      label: '已解冻',
      value: formatCount(data?.unfrozenCount ?? 0),
      color: '#909399',
      icon: Unlock,
      hint: '资金已划入各接收方',
    },
    {
      key: 'failed',
      label: '解冻失败',
      value: formatCount(data?.failedCount ?? 0),
      color: '#f56c6c',
      icon: Warning,
      hint: '重试耗尽，需人工介入',
    },
  ]
})

/** 抽佣比例展示：后端给的是小数，转成百分比更好读 */
function rateText(rate: number | null): string {
  if (rate === null || rate === undefined) return '--'
  return `${(rate * 100).toFixed(2)}%`
}

/* ------------------------------ 详情抽屉 ------------------------------ */

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<PlatformProfitShareItem | null>(null)

async function openDetail(row: PlatformProfitShareItem): Promise<void> {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  try {
    detail.value = await fetchPlatformProfitShareDetail(row.shareNo)
  } finally {
    detailLoading.value = false
  }
}

function handleSearch(): void {
  page.value = DEFAULT_PAGE
}

function handleReset(): void {
  keyword.value = ''
  orderNo.value = ''
  channel.value = undefined
  status.value = undefined
  merchantId.value = undefined
  dateRange.value = null
  page.value = DEFAULT_PAGE
}

function refreshAll(): void {
  void listQuery.refetch()
  void summaryQuery.refetch()
}
</script>

<template>
  <div class="page-container">
    <div class="summary-grid">
      <el-card
        v-for="card in summaryCards"
        :key="card.key"
        class="page-card summary-card"
        shadow="never"
        v-loading="summaryQuery.isPending.value"
      >
        <div class="summary-card__body">
          <div class="summary-card__icon" :style="{ background: `${card.color}1a`, color: card.color }">
            <el-icon :size="20"><component :is="card.icon" /></el-icon>
          </div>
          <div class="summary-card__text">
            <p class="summary-card__label">{{ card.label }}</p>
            <p class="summary-card__value" :style="{ color: card.color }">{{ card.value }}</p>
            <p v-if="card.hint" class="summary-card__hint">{{ card.hint }}</p>
          </div>
        </div>
      </el-card>
    </div>

    <div class="page-card">
      <div class="page-toolbar">
        <el-space wrap :size="12">
          <el-input
            v-model="keyword"
            placeholder="商户名称 / 商户编号"
            clearable
            class="toolbar-input"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-input
            v-model="orderNo"
            placeholder="订单号（精确匹配）"
            clearable
            class="toolbar-input"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          />
          <el-select v-model="channel" placeholder="全部渠道" clearable class="toolbar-select" @change="handleSearch">
            <el-option v-for="item in PAYMENT_CHANNEL_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-select v-model="status" placeholder="全部状态" clearable class="toolbar-select" @change="handleSearch">
            <el-option v-for="item in PROFIT_SHARE_STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="解冻开始日"
            end-placeholder="解冻结束日"
            class="toolbar-date"
            @change="handleSearch"
          />
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-space>
        <el-button :loading="listQuery.isFetching.value" @click="refreshAll">
          <el-icon><Refresh /></el-icon>
          <span>刷新</span>
        </el-button>
      </div>

      <el-alert
        v-if="merchantId"
        type="info"
        :closable="false"
        show-icon
        :title="`当前仅查看商户 #${merchantId} 的分账，点击「重置」可回到全平台`"
        class="profit-share-alert"
      />

      <el-table
        v-loading="listQuery.isFetching.value"
        :data="rows"
        border
        stripe
        row-key="shareNo"
        class="profit-share-table"
        @row-dblclick="openDetail"
      >
        <el-table-column label="商户" min-width="180">
          <template #default="{ row }: { row: PlatformProfitShareItem }">
            <div class="cell-text">
              <span class="text-ellipsis">{{ row.merchantName }}</span>
              <p class="table-sub-text table-mono">{{ row.merchantCode }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="分账单号 / 支付单号" min-width="230">
          <template #default="{ row }: { row: PlatformProfitShareItem }">
            <div class="cell-text">
              <span class="table-mono">{{ row.shareNo }}</span>
              <p class="table-sub-text table-mono">{{ row.paymentNo || '支付单已删除' }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="渠道" width="110">
          <template #default="{ row }: { row: PlatformProfitShareItem }">
            {{ dictLabel(PAYMENT_CHANNEL_DICT, row.channel) }}
          </template>
        </el-table-column>
        <el-table-column label="支付额" width="120" align="right">
          <template #default="{ row }: { row: PlatformProfitShareItem }">
            <span class="amount-strong">{{ formatMoney(row.totalAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="平台抽佣 / 商户结算" width="170" align="right">
          <template #default="{ row }: { row: PlatformProfitShareItem }">
            <div class="cell-text cell-text--right">
              <span class="amount-commission">{{ formatMoney(row.platformAmount) }}</span>
              <p class="table-sub-text">结算 {{ formatMoney(row.merchantAmount) }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="抽佣比例" width="100" align="center">
          <template #default="{ row }: { row: PlatformProfitShareItem }">
            <span :class="{ 'text-muted': row.rate === null }">{{ rateText(row.rate) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }: { row: PlatformProfitShareItem }">
            <StatusTag :item="PROFIT_SHARE_STATUS_DICT[row.status]" />
          </template>
        </el-table-column>
        <el-table-column label="解冻时间" width="180">
          <template #default="{ row }: { row: PlatformProfitShareItem }">
            <div class="cell-text">
              <TimeText :value="row.unfrozenAt" placeholder="未解冻" />
              <p class="table-sub-text">
                <span v-if="isOpenProfitShare(row.status)" class="text-warning">
                  计划 {{ formatDateTime(row.unfreezeAt) }}
                </span>
                <span v-else-if="row.failureReason" class="text-danger text-ellipsis">{{ row.failureReason }}</span>
                <span v-else>生成 {{ formatDateTime(row.createdAt) }}</span>
              </p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center" fixed="right">
          <template #default="{ row }: { row: PlatformProfitShareItem }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty
            :description="listQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '暂无分账流水'"
            :image-size="80"
          />
        </template>
      </el-table>

      <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" />
    </div>

    <el-drawer v-model="detailVisible" title="分账详情" size="480px">
      <div v-loading="detailLoading" class="detail-body">
        <template v-if="detail">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="分账单号">
              <span class="table-mono">{{ detail.shareNo }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="支付单号">
              <span class="table-mono">{{ detail.paymentNo || '--' }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="商户">
              {{ detail.merchantName }}（{{ detail.merchantCode }}）
            </el-descriptions-item>
            <el-descriptions-item label="渠道">
              {{ dictLabel(PAYMENT_CHANNEL_DICT, detail.channel) }}
            </el-descriptions-item>
            <el-descriptions-item label="支付额">{{ formatMoney(detail.totalAmount) }}</el-descriptions-item>
            <el-descriptions-item label="平台抽佣">
              <span class="amount-commission">{{ formatMoney(detail.platformAmount) }}</span>
              <span class="text-muted">（{{ rateText(detail.rate) }}）</span>
            </el-descriptions-item>
            <el-descriptions-item label="商户结算">{{ formatMoney(detail.merchantAmount) }}</el-descriptions-item>
            <el-descriptions-item label="业务状态">
              <StatusTag :item="PROFIT_SHARE_STATUS_DICT[detail.status]" />
            </el-descriptions-item>
            <el-descriptions-item label="平台侧状态">
              <StatusTag :item="PROFIT_SHARE_STATUS_DICT[detail.platformStatus]" />
            </el-descriptions-item>
            <el-descriptions-item label="商户侧状态">
              <StatusTag :item="PROFIT_SHARE_STATUS_DICT[detail.merchantStatus]" />
            </el-descriptions-item>
            <el-descriptions-item label="计划解冻">{{ formatDateTime(detail.unfreezeAt) }}</el-descriptions-item>
            <el-descriptions-item label="实际解冻">
              <TimeText :value="detail.unfrozenAt" placeholder="未解冻" />
            </el-descriptions-item>
            <el-descriptions-item v-if="detail.failureReason" label="失败原因">
              <span class="text-danger">{{ detail.failureReason }}</span>
            </el-descriptions-item>
          </el-descriptions>
          <p class="detail-hint">
            <el-icon><Coin /></el-icon>
            平台抽佣 + 商户结算 = 支付额。解冻由定时任务按 T+1 自动执行，失败会自动重试。
          </p>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
}

.summary-card :deep(.el-card__body) {
  padding: 14px 16px;
}

.summary-card__body {
  display: flex;
  gap: 12px;
  align-items: center;
}

.summary-card__icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
}

.summary-card__text {
  min-width: 0;
}

.summary-card__label {
  margin: 0 0 4px;
  font-size: 13px;
  color: #909399;
}

.summary-card__value {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.2;
}

.summary-card__hint {
  margin: 2px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: #a8abb2;
}

.profit-share-alert {
  margin: 0 16px 8px;
}

.toolbar-input {
  width: 200px;
}

.toolbar-select {
  width: 150px;
}

.toolbar-date {
  width: 280px;
}

.profit-share-table {
  width: 100%;
  margin-top: 8px;
}

.cell-text--right {
  align-items: flex-end;
}

.amount-strong {
  font-weight: 600;
  color: #303133;
}

.amount-commission {
  font-weight: 600;
  color: #f56c6c;
}

.text-warning {
  color: #e6a23c;
}

.text-danger {
  color: #f56c6c;
}

.detail-body {
  min-height: 200px;
}

.detail-hint {
  display: flex;
  gap: 6px;
  align-items: center;
  margin: 16px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
}

@media (max-width: 1400px) {
  .summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
