<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { CircleCheck, Coin, Money, Refresh, Search, SwitchButton, Warning } from '@element-plus/icons-vue'

import {
  fetchPlatformPaymentNotifies,
  fetchPlatformPayments,
  fetchPlatformPaymentSummary,
  fetchPlatformRefunds,
} from '@/api/payment'
import { QUERY_KEYS } from '@/api/keys'
import type {
  PaymentChannel,
  PaymentStatus,
  PlatformPaymentItem,
  PlatformPaymentListParams,
  PlatformPaymentNotifyLog,
  PlatformRefundItem,
  PlatformRefundListParams,
  RefundStatus,
} from '@/api/types/payment'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import {
  PAYMENT_CHANNEL_DICT,
  PAYMENT_CHANNEL_OPTIONS,
  PAYMENT_STATUS_DICT,
  PAYMENT_STATUS_OPTIONS,
  REFUND_STATUS_DICT,
  REFUND_STATUS_OPTIONS,
  dictLabel,
  isOpenPayment,
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

/** 只在 merchantId 从商户详情带进来时生效，口径与商户支付页一致 */
function initialMerchantId(): number | undefined {
  const value = Number(route.query.merchantId)
  return Number.isInteger(value) && value > 0 ? value : undefined
}

const activeTab = ref<'payments' | 'refunds'>('payments')

const keyword = ref('')
const channel = ref<PaymentChannel | undefined>()
const orderNo = ref('')
const merchantId = ref<number | undefined>(initialMerchantId())
const dateRange = ref<[string, string] | null>(null)
/** 两个 tab 各自维护状态筛选与分页，切回来不会互相污染 */
const paymentStatus = ref<PaymentStatus | undefined>()
const refundStatus = ref<RefundStatus | undefined>()
const paymentPage = ref(DEFAULT_PAGE)
const paymentPageSize = ref(DEFAULT_PAGE_SIZE)
const refundPage = ref(DEFAULT_PAGE)
const refundPageSize = ref(DEFAULT_PAGE_SIZE)

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

const paymentParams = computed<PlatformPaymentListParams>(() => ({
  keyword: keyword.value.trim() || undefined,
  orderNo: orderNo.value.trim() || undefined,
  channel: channel.value,
  status: paymentStatus.value,
  merchantId: merchantId.value,
  page: paymentPage.value,
  pageSize: paymentPageSize.value,
  ...rangeParams.value,
}))

const refundParams = computed<PlatformRefundListParams>(() => ({
  keyword: keyword.value.trim() || undefined,
  channel: channel.value,
  status: refundStatus.value,
  merchantId: merchantId.value,
  page: refundPage.value,
  pageSize: refundPageSize.value,
  ...rangeParams.value,
}))

const paymentQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.platformPayments, 'list', paymentParams.value]),
  queryFn: () => fetchPlatformPayments(paymentParams.value),
  enabled: computed(() => canRead.value && activeTab.value === 'payments'),
  placeholderData: keepPreviousData,
})

const refundQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.platformPayments, 'refunds', refundParams.value]),
  queryFn: () => fetchPlatformRefunds(refundParams.value),
  enabled: computed(() => canRead.value && activeTab.value === 'refunds'),
  placeholderData: keepPreviousData,
})

const summaryQuery = useQuery({
  queryKey: [...QUERY_KEYS.platformPayments, 'summary'],
  queryFn: () => fetchPlatformPaymentSummary(),
  enabled: computed(() => canRead.value),
})

const paymentRows = computed<PlatformPaymentItem[]>(() => paymentQuery.data.value?.list ?? [])
const paymentTotal = computed(() => paymentQuery.data.value?.total ?? 0)
const refundRows = computed<PlatformRefundItem[]>(() => refundQuery.data.value?.list ?? [])
const refundTotal = computed(() => refundQuery.data.value?.total ?? 0)

const summaryCards = computed<SummaryCard[]>(() => {
  const data = summaryQuery.data.value
  return [
    {
      key: 'today',
      label: '今日交易额',
      value: formatMoney(data?.todayAmount ?? 0),
      color: '#4f7cff',
      icon: Money,
      hint: `今日 ${formatCount(data?.todayCount ?? 0)} 笔`,
    },
    {
      key: 'total',
      label: '累计交易额',
      value: formatMoney(data?.totalAmount ?? 0),
      color: '#67c23a',
      icon: CircleCheck,
      hint: `成功 ${formatCount(data?.totalCount ?? 0)} 笔`,
    },
    {
      key: 'refund',
      label: '累计退款额',
      value: formatMoney(data?.refundAmount ?? 0),
      color: '#e6a23c',
      icon: SwitchButton,
      hint: `退款 ${formatCount(data?.refundCount ?? 0)} 笔（不冲抵交易额）`,
    },
    {
      key: 'open',
      label: '未完成',
      value: formatCount(data?.openCount ?? 0),
      color: '#f59e0b',
      icon: Warning,
      hint: 'created / paying，超时将自动关单',
    },
    {
      key: 'abnormal',
      label: '异常',
      value: formatCount((data?.closedCount ?? 0) + (data?.failedCount ?? 0)),
      color: '#f56c6c',
      icon: Warning,
      hint: `关单 ${formatCount(data?.closedCount ?? 0)} · 失败 ${formatCount(data?.failedCount ?? 0)}`,
    },
  ]
})

/** 展开行里按需拉取渠道通知，只有真展开时才请求，避免一屏几十条打爆后端 */
const notifyCache = ref<Record<string, PlatformPaymentNotifyLog[]>>({})
const notifyLoading = ref<Record<string, boolean>>({})

async function loadNotifies(paymentNo: string): Promise<void> {
  if (notifyCache.value[paymentNo] || notifyLoading.value[paymentNo]) return
  notifyLoading.value = { ...notifyLoading.value, [paymentNo]: true }
  try {
    const logs = await fetchPlatformPaymentNotifies(paymentNo)
    notifyCache.value = { ...notifyCache.value, [paymentNo]: logs }
  } finally {
    const next = { ...notifyLoading.value }
    delete next[paymentNo]
    notifyLoading.value = next
  }
}

function handleExpand(row: PlatformPaymentItem, expandedRows: PlatformPaymentItem[]): void {
  const isOpen = expandedRows.some((item) => item.paymentNo === row.paymentNo)
  if (isOpen) void loadNotifies(row.paymentNo)
}

/** payload 可能是任意渠道报文，展示成折叠的 JSON 文本即可，不做字段映射 */
function payloadText(log: PlatformPaymentNotifyLog): string {
  if (log.payload) {
    try {
      return JSON.stringify(log.payload, null, 2)
    } catch {
      return String(log.payload)
    }
  }
  return log.rawBody ?? '无报文'
}

function handleSearch(): void {
  paymentPage.value = DEFAULT_PAGE
  refundPage.value = DEFAULT_PAGE
}

function handleReset(): void {
  keyword.value = ''
  orderNo.value = ''
  channel.value = undefined
  merchantId.value = undefined
  dateRange.value = null
  paymentStatus.value = undefined
  refundStatus.value = undefined
  paymentPage.value = DEFAULT_PAGE
  refundPage.value = DEFAULT_PAGE
}

function refreshAll(): void {
  if (activeTab.value === 'payments') {
    void paymentQuery.refetch()
  } else {
    void refundQuery.refetch()
  }
  void summaryQuery.refetch()
}

const currentFetching = computed(() =>
  activeTab.value === 'payments' ? paymentQuery.isFetching.value : refundQuery.isFetching.value,
)
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
            placeholder="商户名称 / 商户编号 / 支付单号 / 渠道交易号"
            clearable
            class="toolbar-input toolbar-input--wide"
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
          <el-select
            v-if="activeTab === 'payments'"
            v-model="paymentStatus"
            placeholder="全部状态"
            clearable
            class="toolbar-select"
            @change="handleSearch"
          >
            <el-option v-for="item in PAYMENT_STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-select
            v-else
            v-model="refundStatus"
            placeholder="全部状态"
            clearable
            class="toolbar-select"
            @change="handleSearch"
          >
            <el-option v-for="item in REFUND_STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            class="toolbar-date"
            @change="handleSearch"
          />
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-space>
        <el-button :loading="currentFetching" @click="refreshAll">
          <el-icon><Refresh /></el-icon>
          <span>刷新</span>
        </el-button>
      </div>

      <el-alert
        v-if="merchantId"
        type="info"
        :closable="false"
        show-icon
        :title="`当前仅查看商户 #${merchantId} 的流水，点击「重置」可回到全平台`"
        class="payment-alert"
      />

      <el-tabs v-model="activeTab" class="payment-tabs">
        <el-tab-pane name="payments">
          <template #label>
            <span class="payment-tab-label"><el-icon><Coin /></el-icon> 支付流水</span>
          </template>
          <el-table
            v-loading="paymentQuery.isFetching.value"
            :data="paymentRows"
            border
            stripe
            row-key="paymentNo"
            class="payment-table"
            @expand-change="handleExpand"
          >
            <el-table-column type="expand">
              <template #default="{ row }: { row: PlatformPaymentItem }">
                <div class="notify-panel" v-loading="notifyLoading[row.paymentNo]">
                  <p class="notify-panel__title">
                    渠道通知记录
                    <span class="text-muted">
                      （共 {{ row.notifyCount }} 条，含重复通知；排障时对照金额与验签结果）
                    </span>
                  </p>
                  <el-empty
                    v-if="(notifyCache[row.paymentNo]?.length ?? 0) === 0"
                    description="暂无渠道通知记录"
                    :image-size="48"
                  />
                  <el-table v-else :data="notifyCache[row.paymentNo]" size="small" border>
                    <el-table-column label="类型" width="90">
                      <template #default="{ row: log }: { row: PlatformPaymentNotifyLog }">
                        {{ log.notifyType === 'refund' ? '退款通知' : '支付通知' }}
                      </template>
                    </el-table-column>
                    <el-table-column label="通知 ID" min-width="150">
                      <template #default="{ row: log }: { row: PlatformPaymentNotifyLog }">
                        <span class="table-mono">{{ log.notifyId || '--' }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="金额" width="110" align="right">
                      <template #default="{ row: log }: { row: PlatformPaymentNotifyLog }">
                        {{ log.amount === null ? '--' : formatMoney(log.amount) }}
                      </template>
                    </el-table-column>
                    <el-table-column label="验签" width="80" align="center">
                      <template #default="{ row: log }: { row: PlatformPaymentNotifyLog }">
                        <el-tag :type="log.verified ? 'success' : 'danger'" size="small" effect="light">
                          {{ log.verified ? '通过' : '失败' }}
                        </el-tag>
                      </template>
                    </el-table-column>
                    <el-table-column label="处理" width="86" align="center">
                      <template #default="{ row: log }: { row: PlatformPaymentNotifyLog }">
                        <el-tag :type="log.handled ? 'success' : 'info'" size="small" effect="light">
                          {{ log.handled ? '已处理' : '已忽略' }}
                        </el-tag>
                      </template>
                    </el-table-column>
                    <el-table-column label="处理结果" min-width="150">
                      <template #default="{ row: log }: { row: PlatformPaymentNotifyLog }">
                        <span :class="{ 'text-muted': !log.processResult }">{{ log.processResult || '--' }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="时间" width="160">
                      <template #default="{ row: log }: { row: PlatformPaymentNotifyLog }">
                        <TimeText :value="log.createdAt" />
                      </template>
                    </el-table-column>
                    <el-table-column type="expand">
                      <template #default="{ row: log }: { row: PlatformPaymentNotifyLog }">
                        <pre class="notify-raw">{{ payloadText(log) }}</pre>
                      </template>
                    </el-table-column>
                  </el-table>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="商户" min-width="180">
              <template #default="{ row }: { row: PlatformPaymentItem }">
                <div class="cell-text">
                  <span class="text-ellipsis">{{ row.merchantName }}</span>
                  <p class="table-sub-text table-mono">{{ row.merchantCode }}</p>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="支付单号 / 订单号" min-width="220">
              <template #default="{ row }: { row: PlatformPaymentItem }">
                <div class="cell-text">
                  <span class="table-mono">{{ row.paymentNo }}</span>
                  <p class="table-sub-text table-mono">{{ row.orderNo || '订单号已脱敏或不存在' }}</p>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="渠道" width="120">
              <template #default="{ row }: { row: PlatformPaymentItem }">
                <div class="cell-text">
                  <span>{{ dictLabel(PAYMENT_CHANNEL_DICT, row.channel) }}</span>
                  <p v-if="row.channelAccount" class="table-sub-text table-mono">{{ row.channelAccount }}</p>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="金额" width="130" align="right">
              <template #default="{ row }: { row: PlatformPaymentItem }">
                <div class="cell-text cell-text--right">
                  <span class="amount-strong">{{ formatMoney(row.amount) }}</span>
                  <p v-if="row.refundedAmount > 0" class="table-sub-text amount-refund">
                    已退 {{ formatMoney(row.refundedAmount) }}
                  </p>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }: { row: PlatformPaymentItem }">
                <StatusTag :item="PAYMENT_STATUS_DICT[row.status]" />
              </template>
            </el-table-column>
            <el-table-column label="分账" width="90" align="center">
              <template #default="{ row }: { row: PlatformPaymentItem }">
                <el-tag v-if="row.needProfitSharing" type="warning" size="small" effect="light">待分账</el-tag>
                <span v-else class="text-muted">--</span>
              </template>
            </el-table-column>
            <el-table-column label="渠道交易号" min-width="180">
              <template #default="{ row }: { row: PlatformPaymentItem }">
                <span v-if="row.tradeNo" class="table-mono">{{ row.tradeNo }}</span>
                <span v-else class="text-muted">未回执</span>
              </template>
            </el-table-column>
            <el-table-column label="支付时间" width="170">
              <template #default="{ row }: { row: PlatformPaymentItem }">
                <div class="cell-text">
                  <TimeText :value="row.paidAt" placeholder="未支付" />
                  <p class="table-sub-text">
                    <span v-if="isOpenPayment(row.status)" class="text-warning">待支付，超时自动关单</span>
                    <span v-else-if="row.failureReason" class="text-danger text-ellipsis">{{ row.failureReason }}</span>
                    <span v-else>创建 {{ formatDateTime(row.createdAt) }}</span>
                  </p>
                </div>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty
                :description="paymentQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '暂无支付流水'"
                :image-size="80"
              />
            </template>
          </el-table>

          <PaginationBar v-model:page="paymentPage" v-model:page-size="paymentPageSize" :total="paymentTotal" />
        </el-tab-pane>

        <el-tab-pane name="refunds">
          <template #label>
            <span class="payment-tab-label"><el-icon><SwitchButton /></el-icon> 退款流水</span>
          </template>
          <el-table v-loading="refundQuery.isFetching.value" :data="refundRows" border stripe class="payment-table">
            <el-table-column label="商户" min-width="180">
              <template #default="{ row }: { row: PlatformRefundItem }">
                <div class="cell-text">
                  <span class="text-ellipsis">{{ row.merchantName }}</span>
                  <p class="table-sub-text table-mono">{{ row.merchantCode }}</p>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="退款单号 / 原支付单" min-width="220">
              <template #default="{ row }: { row: PlatformRefundItem }">
                <div class="cell-text">
                  <span class="table-mono">{{ row.refundNo }}</span>
                  <p class="table-sub-text table-mono">{{ row.paymentNo || '原支付单已删除' }}</p>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="订单号" min-width="180">
              <template #default="{ row }: { row: PlatformRefundItem }">
                <span v-if="row.orderNo" class="table-mono">{{ row.orderNo }}</span>
                <span v-else class="text-muted">--</span>
              </template>
            </el-table-column>
            <el-table-column label="渠道" width="110">
              <template #default="{ row }: { row: PlatformRefundItem }">
                {{ dictLabel(PAYMENT_CHANNEL_DICT, row.channel) }}
              </template>
            </el-table-column>
            <el-table-column label="退款金额 / 原单金额" width="150" align="right">
              <template #default="{ row }: { row: PlatformRefundItem }">
                <div class="cell-text cell-text--right">
                  <span class="amount-strong">{{ formatMoney(row.amount) }}</span>
                  <p class="table-sub-text">原单 {{ formatMoney(row.totalAmount) }}</p>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }: { row: PlatformRefundItem }">
                <StatusTag :item="REFUND_STATUS_DICT[row.status]" />
              </template>
            </el-table-column>
            <el-table-column label="退款原因" min-width="160">
              <template #default="{ row }: { row: PlatformRefundItem }">
                <span v-if="row.reason" class="text-ellipsis" :title="row.reason">{{ row.reason }}</span>
                <span v-else class="text-muted">--</span>
              </template>
            </el-table-column>
            <el-table-column label="操作人" width="110">
              <template #default="{ row }: { row: PlatformRefundItem }">
                <span :class="{ 'text-muted': !row.operatorName }">{{ row.operatorName || '--' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="退款时间" width="170">
              <template #default="{ row }: { row: PlatformRefundItem }">
                <div class="cell-text">
                  <TimeText :value="row.succeededAt" placeholder="未完成" />
                  <p class="table-sub-text">发起 {{ formatDateTime(row.createdAt) }}</p>
                </div>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty
                :description="refundQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '暂无退款流水'"
                :image-size="80"
              />
            </template>
          </el-table>

          <PaginationBar v-model:page="refundPage" v-model:page-size="refundPageSize" :total="refundTotal" />
        </el-tab-pane>
      </el-tabs>
    </div>
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

.payment-alert {
  margin: 0 16px 8px;
}

.toolbar-input {
  width: 200px;
}

.toolbar-input--wide {
  width: 260px;
}

.toolbar-select {
  width: 150px;
}

.toolbar-date {
  width: 260px;
}

.payment-tabs {
  padding: 0 16px;
}

.payment-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}

.payment-tab-label {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.payment-table {
  width: 100%;
}

.cell-text--right {
  align-items: flex-end;
}

.amount-strong {
  font-weight: 600;
  color: #f56c6c;
}

.amount-refund {
  color: #e6a23c;
}

.text-warning {
  color: #e6a23c;
}

.text-danger {
  color: #f56c6c;
}

.notify-panel {
  padding: 12px 16px 16px 48px;
  background: #fafbfd;
}

.notify-panel__title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
}

.notify-raw {
  max-height: 260px;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.6;
  color: #303133;
  background: #fff;
  border: 1px solid #e8ecf4;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-all;
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
