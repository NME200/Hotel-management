<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheck, DocumentChecked, Refresh, Search, Timer, Warning } from '@element-plus/icons-vue'

import {
  fetchPlatformReconcileDetail,
  fetchPlatformReconciles,
  fetchPlatformReconcileSummary,
  runPlatformReconcile,
} from '@/api/payment'
import { QUERY_KEYS } from '@/api/keys'
import type {
  PaymentChannel,
  PlatformReconcileDetailItem,
  PlatformReconcileItem,
  PlatformReconcileListParams,
  ReconcileStatus,
} from '@/api/types/payment'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import {
  PAYMENT_CHANNEL_DICT,
  PAYMENT_CHANNEL_OPTIONS,
  RECONCILE_DIFF_TYPE_DICT,
  RECONCILE_STATUS_DICT,
  RECONCILE_STATUS_OPTIONS,
  dictLabel,
  isOpenReconcile,
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
const queryClient = useQueryClient()

const canRead = computed(() => authStore.can(PERMISSION.paymentRead))

/** 只在 merchantId 从商户详情带进来时生效，口径与支付流水/分账页一致 */
function initialMerchantId(): number | undefined {
  const value = Number(route.query.merchantId)
  return Number.isInteger(value) && value > 0 ? value : undefined
}

const channel = ref<PaymentChannel | undefined>()
const status = ref<ReconcileStatus | undefined>()
const merchantId = ref<number | undefined>(initialMerchantId())
const dateRange = ref<[string, string] | null>(null)
const page = ref(DEFAULT_PAGE)
const pageSize = ref(DEFAULT_PAGE_SIZE)

const listParams = computed<PlatformReconcileListParams>(() => ({
  channel: channel.value,
  status: status.value,
  merchantId: merchantId.value,
  page: page.value,
  pageSize: pageSize.value,
  ...rangeParams.value,
}))

/** 起止日期直接取 daterange 的 value-format（已是 YYYY-MM-DD），后端按日首尾截断 */
const rangeParams = computed<{ from?: string; to?: string }>(() => {
  const range = dateRange.value
  if (!range || range.length !== 2 || !range[0] || !range[1]) return {}
  return { from: range[0], to: range[1] }
})

const listQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.platformReconciles, 'list', listParams.value]),
  queryFn: () => fetchPlatformReconciles(listParams.value),
  enabled: canRead,
  placeholderData: keepPreviousData,
})

const summaryQuery = useQuery({
  queryKey: [...QUERY_KEYS.platformReconciles, 'summary'],
  queryFn: () => fetchPlatformReconcileSummary(),
  enabled: canRead,
})

const rows = computed<PlatformReconcileItem[]>(() => listQuery.data.value?.list ?? [])
const total = computed(() => listQuery.data.value?.total ?? 0)

const summaryCards = computed<SummaryCard[]>(() => {
  const data = summaryQuery.data.value
  return [
    {
      key: 'last',
      label: '最近对账日',
      value: data?.lastTradeDate ?? '--',
      color: '#4f7cff',
      icon: DocumentChecked,
      hint: '每日 02:00 自动对账前一自然日',
    },
    {
      key: 'balanced',
      label: '已平账',
      value: formatCount(data?.balancedCount ?? 0),
      color: '#67c23a',
      icon: CircleCheck,
      hint: '渠道账与本地账完全一致',
    },
    {
      key: 'mismatch',
      label: '有差异',
      value: formatCount(data?.mismatchCount ?? 0),
      color: '#f56c6c',
      icon: Warning,
      hint: `差异金额 ${formatMoney(data?.diffAmount ?? 0)}，需逐笔核查`,
    },
    {
      key: 'pending',
      label: '账单未出',
      value: formatCount(data?.pendingCount ?? 0),
      color: '#e6a23c',
      icon: Timer,
      hint: '渠道账单未出齐，自动重试中',
    },
    {
      key: 'failed',
      label: '对账失败',
      value: formatCount(data?.failedCount ?? 0),
      color: '#909399',
      icon: Warning,
      hint: '重试耗尽，需人工补跑',
    },
  ]
})

/* ------------------------------ 手动补跑 ------------------------------ */

const runDialogVisible = ref(false)
const runDate = ref<string>('')
const runChannel = ref<PaymentChannel | undefined>()

const runMutation = useMutation({
  mutationFn: (input: { tradeDate: string; channel?: PaymentChannel }) => runPlatformReconcile(input),
  onSuccess: async (data) => {
    runDialogVisible.value = false
    ElMessage.success(`对账已重算：${data.tradeDate}，处理台账 ${data.handled} 份`)
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.platformReconciles })
  },
  onError: (error: unknown) => {
    ElMessage.error(error instanceof Error ? error.message : '补跑失败，请稍后重试')
  },
})

/** 默认补跑"昨天"——自动对账跑的就是这一天，重算它最常用 */
function openRunDialog(): void {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  runDate.value = dayKey(yesterday)
  runChannel.value = undefined
  runDialogVisible.value = true
}

function dayKey(value: Date): string {
  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function submitRun(): void {
  if (!runDate.value) {
    ElMessage.warning('请选择要对账的日期')
    return
  }
  void ElMessageBox.confirm(
    `将对账日 ${runDate.value} 的账目重新核对一遍。该操作只重算核对结果，不会修改任何支付或资金数据。`,
    '确认补跑对账',
    { type: 'warning', confirmButtonText: '开始补跑', cancelButtonText: '取消' },
  )
    .then(() => {
      runMutation.mutate({ tradeDate: runDate.value, channel: runChannel.value })
    })
    .catch(() => undefined)
}

/* ------------------------------ 详情抽屉 ------------------------------ */

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<PlatformReconcileItem | null>(null)
const detailRows = ref<PlatformReconcileDetailItem[]>([])

async function openDetail(row: PlatformReconcileItem): Promise<void> {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  detailRows.value = []
  try {
    const data = await fetchPlatformReconcileDetail(row.reconcileNo)
    detail.value = data.reconcile
    detailRows.value = data.details
  } finally {
    detailLoading.value = false
  }
}

function handleSearch(): void {
  page.value = DEFAULT_PAGE
}

function handleReset(): void {
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

/** 渠道与本地笔数/金额的差值，直接展示在表格里省得运营心算 */
function channelMinusLocal(row: PlatformReconcileItem): number {
  return Number((row.channelAmount - row.localAmount).toFixed(2))
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
          <el-select v-model="channel" placeholder="全部渠道" clearable class="toolbar-select" @change="handleSearch">
            <el-option v-for="item in PAYMENT_CHANNEL_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-select v-model="status" placeholder="全部状态" clearable class="toolbar-select" @change="handleSearch">
            <el-option v-for="item in RECONCILE_STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="对账开始日"
            end-placeholder="对账结束日"
            class="toolbar-date"
            @change="handleSearch"
          />
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon>
            <span>查询</span>
          </el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-space>
        <div class="toolbar-actions">
          <el-button :loading="listQuery.isFetching.value" @click="refreshAll">
            <el-icon><Refresh /></el-icon>
            <span>刷新</span>
          </el-button>
          <el-button type="primary" plain @click="openRunDialog">手动补跑</el-button>
        </div>
      </div>

      <el-alert
        v-if="merchantId"
        type="info"
        :closable="false"
        show-icon
        :title="`当前仅查看商户 #${merchantId} 的对账，点击「重置」可回到全平台`"
        class="reconcile-alert"
      />

      <el-table
        v-loading="listQuery.isFetching.value"
        :data="rows"
        border
        stripe
        row-key="reconcileNo"
        class="reconcile-table"
        @row-dblclick="openDetail"
      >
        <el-table-column label="对账日 / 对账单号" width="220">
          <template #default="{ row }: { row: PlatformReconcileItem }">
            <div class="cell-text">
              <span class="text-strong">{{ row.tradeDate }}</span>
              <p class="table-sub-text table-mono">{{ row.reconcileNo }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="商户" min-width="160">
          <template #default="{ row }: { row: PlatformReconcileItem }">
            <div class="cell-text">
              <span class="text-ellipsis">{{ row.merchantName }}</span>
              <p class="table-sub-text table-mono">{{ row.merchantCode }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="渠道" width="100">
          <template #default="{ row }: { row: PlatformReconcileItem }">
            {{ dictLabel(PAYMENT_CHANNEL_DICT, row.channel) }}
          </template>
        </el-table-column>
        <el-table-column label="渠道账" width="150" align="right">
          <template #default="{ row }: { row: PlatformReconcileItem }">
            <div class="cell-text cell-text--right">
              <span class="amount-strong">{{ formatMoney(row.channelAmount) }}</span>
              <p class="table-sub-text">
                {{ formatCount(row.channelCount) }} 笔 · 手续费 {{ formatMoney(row.channelFee) }}
              </p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="本地账" width="150" align="right">
          <template #default="{ row }: { row: PlatformReconcileItem }">
            <div class="cell-text cell-text--right">
              <span class="amount-strong">{{ formatMoney(row.localAmount) }}</span>
              <p class="table-sub-text">
                {{ formatCount(row.localCount) }} 笔
                <template v-if="row.localRefund > 0"> · 退款 {{ formatMoney(row.localRefund) }}</template>
              </p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="差额" width="110" align="right">
          <template #default="{ row }: { row: PlatformReconcileItem }">
            <span :class="channelMinusLocal(row) === 0 ? 'text-muted' : 'text-danger'">
              {{ channelMinusLocal(row) === 0 ? '0.00' : formatMoney(channelMinusLocal(row)) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="差异" width="130" align="center">
          <template #default="{ row }: { row: PlatformReconcileItem }">
            <div class="cell-text" style="align-items: center">
              <span v-if="row.diffCount > 0" class="text-danger">{{ formatCount(row.diffCount) }} 笔</span>
              <span v-else class="text-muted">无</span>
              <p v-if="row.diffCount > 0" class="table-sub-text text-danger">
                {{ formatMoney(row.diffAmount) }}
              </p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }: { row: PlatformReconcileItem }">
            <StatusTag :item="RECONCILE_STATUS_DICT[row.status]" />
          </template>
        </el-table-column>
        <el-table-column label="对账时间" width="170">
          <template #default="{ row }: { row: PlatformReconcileItem }">
            <div class="cell-text">
              <TimeText :value="row.reconciledAt" placeholder="未完成" />
              <p class="table-sub-text">
                <span v-if="isOpenReconcile(row.status)" class="text-warning">
                  重试 {{ row.retryCount }} 次<span v-if="row.nextRetryAt">，下次 {{ formatDateTime(row.nextRetryAt) }}</span>
                </span>
                <span v-else-if="row.failureReason" class="text-danger text-ellipsis">{{ row.failureReason }}</span>
                <span v-else>账单已取回</span>
              </p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center" fixed="right">
          <template #default="{ row }: { row: PlatformReconcileItem }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty
            :description="listQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '暂无对账记录，可点击「手动补跑」'"
            :image-size="80"
          />
        </template>
      </el-table>

      <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" />
    </div>

    <el-dialog v-model="runDialogVisible" title="手动补跑对账" width="460px">
      <el-form label-width="90px">
        <el-form-item label="对账日" required>
          <el-date-picker
            v-model="runDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择要对账的日期"
            class="full-width"
          />
        </el-form-item>
        <el-form-item label="渠道">
          <el-select v-model="runChannel" placeholder="全部启用渠道" clearable class="full-width">
            <el-option v-for="item in PAYMENT_CHANNEL_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
      </el-form>
      <p class="dialog-hint">
        补跑会重新下载渠道账单并与本地账逐笔核对。<strong>只重算核对结果</strong>，
        不会修改任何支付、分账或资金数据。
      </p>
      <template #footer>
        <el-button @click="runDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="runMutation.isPending.value" @click="submitRun">开始补跑</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="对账详情" size="720px">
      <div v-loading="detailLoading" class="detail-body">
        <template v-if="detail">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="对账单号">
              <span class="table-mono">{{ detail.reconcileNo }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="对账日">{{ detail.tradeDate }}</el-descriptions-item>
            <el-descriptions-item label="商户">
              {{ detail.merchantName }}（{{ detail.merchantCode }}）
            </el-descriptions-item>
            <el-descriptions-item label="渠道">
              {{ dictLabel(PAYMENT_CHANNEL_DICT, detail.channel) }}
            </el-descriptions-item>
            <el-descriptions-item label="渠道账">
              {{ formatCount(detail.channelCount) }} 笔 / {{ formatMoney(detail.channelAmount) }}
            </el-descriptions-item>
            <el-descriptions-item label="本地账">
              {{ formatCount(detail.localCount) }} 笔 / {{ formatMoney(detail.localAmount) }}
            </el-descriptions-item>
            <el-descriptions-item label="渠道手续费">{{ formatMoney(detail.channelFee) }}</el-descriptions-item>
            <el-descriptions-item label="本地当日退款">
              {{ formatMoney(detail.localRefund) }}
            </el-descriptions-item>
            <el-descriptions-item label="差异">
              <span :class="detail.diffCount > 0 ? 'text-danger' : 'text-muted'">
                {{ formatCount(detail.diffCount) }} 笔 / {{ formatMoney(detail.diffAmount) }}
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="状态">
              <StatusTag :item="RECONCILE_STATUS_DICT[detail.status]" />
            </el-descriptions-item>
            <el-descriptions-item label="账单下载">
              <TimeText :value="detail.billFetchedAt" placeholder="未取回" />
            </el-descriptions-item>
            <el-descriptions-item label="对账完成">
              <TimeText :value="detail.reconciledAt" placeholder="未完成" />
            </el-descriptions-item>
            <el-descriptions-item v-if="detail.failureReason" label="失败原因" :span="2">
              <span class="text-danger">{{ detail.failureReason }}</span>
            </el-descriptions-item>
          </el-descriptions>

          <p class="detail-section-title">差异明细（{{ detailRows.length }} 笔）</p>
          <el-table :data="detailRows" border size="small" row-key="id">
            <el-table-column label="类型" width="110">
              <template #default="{ row }: { row: PlatformReconcileDetailItem }">
                <StatusTag :item="RECONCILE_DIFF_TYPE_DICT[row.diffType]" />
              </template>
            </el-table-column>
            <el-table-column label="支付单号" width="200">
              <template #default="{ row }: { row: PlatformReconcileDetailItem }">
                <span class="table-mono">{{ row.outTradeNo }}</span>
              </template>
            </el-table-column>
            <el-table-column label="渠道金额" width="100" align="right">
              <template #default="{ row }: { row: PlatformReconcileDetailItem }">
                <span :class="{ 'text-muted': row.channelAmount === null }">
                  {{ row.channelAmount === null ? '--' : formatMoney(row.channelAmount) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="本地金额" width="100" align="right">
              <template #default="{ row }: { row: PlatformReconcileDetailItem }">
                <span :class="{ 'text-muted': row.localAmount === null }">
                  {{ row.localAmount === null ? '--' : formatMoney(row.localAmount) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="差额" width="90" align="right">
              <template #default="{ row }: { row: PlatformReconcileDetailItem }">
                <span :class="row.diffAmount === 0 ? 'text-muted' : 'text-danger'">
                  {{ formatMoney(row.diffAmount) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="说明" min-width="220" show-overflow-tooltip>
              <template #default="{ row }: { row: PlatformReconcileDetailItem }">
                {{ row.remark }}
              </template>
            </el-table-column>
            <template #empty>
              <el-empty description="账目一致，无差异" :image-size="60" />
            </template>
          </el-table>

          <p class="detail-hint">
            <el-icon><DocumentChecked /></el-icon>
            平台只做核对与展示，不修改任何资金数据。发现差异请据此到「支付流水」页定位该笔支付。
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

.reconcile-alert {
  margin: 0 16px 8px;
}

.toolbar-select {
  width: 150px;
}

.toolbar-date {
  width: 280px;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.reconcile-table {
  width: 100%;
  margin-top: 8px;
}

.cell-text--right {
  align-items: flex-end;
}

.text-strong {
  font-weight: 600;
  color: #303133;
}

.amount-strong {
  font-weight: 600;
  color: #303133;
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

.detail-section-title {
  margin: 20px 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
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

.dialog-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: #909399;
}

.full-width {
  width: 100%;
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
