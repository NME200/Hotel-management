<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Check,
  CircleCheck,
  CircleClose,
  Close,
  Document,
  Refresh,
  Search,
  SwitchButton,
  View,
  Warning,
} from '@element-plus/icons-vue'

import {
  auditMerchantPaymentConfig,
  fetchMerchantPaymentConfigs,
  fetchMerchantPaymentSummary,
  updateMerchantPaymentConfigStatus,
} from '@/api/payment'
import { QUERY_KEYS } from '@/api/keys'
import type {
  MerchantPaymentConfigItem,
  MerchantPaymentConfigListParams,
  MerchantPaymentFilterStatus,
  MerchantPaymentSwitchStatus,
  PaymentChannel,
} from '@/api/types/payment'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import {
  MERCHANT_PAYMENT_FILTER_OPTIONS,
  MERCHANT_PAYMENT_STATUS_DICT,
  PAYMENT_CHANNEL_DICT,
  PAYMENT_CHANNEL_OPTIONS,
  canAuditMerchantPayment,
  canDisableMerchantPayment,
  canEnableMerchantPayment,
  dictLabel,
} from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { formatPercent } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import PaginationBar from '@/components/common/PaginationBar.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import TimeText from '@/components/common/TimeText.vue'
import MerchantPaymentDrawer from './components/MerchantPaymentDrawer.vue'
import type { Component } from 'vue'

interface SummaryCard {
  key: string
  label: string
  value: number
  color: string
  icon: Component
  /** 点击卡片即按该状态筛选；null 表示只做统计、不可点（未申请没有进件记录，无法筛） */
  status: MerchantPaymentFilterStatus | null
  hint?: string
}

const route = useRoute()
const authStore = useAuthStore()
const queryClient = useQueryClient()

const canRead = computed(() => authStore.can(PERMISSION.merchantPaymentRead))
/** 审核与启停都归 platform:merchant-payment:audit，缺权限时按钮整列隐藏 */
const canAudit = computed(() => authStore.can(PERMISSION.merchantPaymentAudit))

/** 支持从商户详情等入口用 query 带入初始筛选，口径与商户管理页一致 */
function initialOf<T extends string>(raw: unknown, map: Record<T, unknown>): T | undefined {
  if (typeof raw !== 'string') return undefined
  return map[raw as T] ? (raw as T) : undefined
}

function initialMerchantId(): number | undefined {
  const value = Number(route.query.merchantId)
  return Number.isInteger(value) && value > 0 ? value : undefined
}

/** not_applied 只能从 query 里带进来，筛它后端会报参数非法，这里直接忽略 */
function initialStatus(raw: unknown): MerchantPaymentFilterStatus | undefined {
  const value = initialOf(raw, MERCHANT_PAYMENT_STATUS_DICT)
  return value && value !== 'not_applied' ? value : undefined
}

const keyword = ref('')
const status = ref<MerchantPaymentFilterStatus | undefined>(initialStatus(route.query.status))
const channel = ref<PaymentChannel | undefined>(initialOf(route.query.channel, PAYMENT_CHANNEL_DICT))
const merchantId = ref<number | undefined>(initialMerchantId())
const page = ref(DEFAULT_PAGE)
const pageSize = ref(DEFAULT_PAGE_SIZE)

const queryParams = computed<MerchantPaymentConfigListParams>(() => ({
  keyword: keyword.value.trim() || undefined,
  status: status.value,
  channel: channel.value,
  merchantId: merchantId.value,
  page: page.value,
  pageSize: pageSize.value,
}))

const listQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.merchantPayment, 'list', queryParams.value]),
  queryFn: () => fetchMerchantPaymentConfigs(queryParams.value),
  enabled: computed(() => canRead.value),
  placeholderData: keepPreviousData,
})

const summaryQuery = useQuery({
  queryKey: [...QUERY_KEYS.merchantPayment, 'summary'],
  queryFn: () => fetchMerchantPaymentSummary(),
  enabled: computed(() => canRead.value),
})

const rows = computed<MerchantPaymentConfigItem[]>(() => listQuery.data.value?.list ?? [])
const total = computed(() => listQuery.data.value?.total ?? 0)

const summaryCards = computed<SummaryCard[]>(() => {
  const data = summaryQuery.data.value
  return [
    {
      key: 'pendingAudit',
      label: '待审核',
      value: data?.pendingAudit ?? 0,
      color: '#e6a23c',
      icon: Warning,
      status: 'pending_audit',
    },
    { key: 'enabled', label: '已开通', value: data?.enabled ?? 0, color: '#67c23a', icon: CircleCheck, status: 'enabled' },
    { key: 'rejected', label: '已驳回', value: data?.rejected ?? 0, color: '#f56c6c', icon: CircleClose, status: 'rejected' },
    { key: 'disabled', label: '已停用', value: data?.disabled ?? 0, color: '#909399', icon: SwitchButton, status: 'disabled' },
    { key: 'notApplied', label: '未申请', value: data?.notApplied ?? 0, color: '#4f7cff', icon: Document, status: null, hint: '尚未提交进件的「商户 × 渠道」组合数，点开任一记录可看该商户三条渠道的完整状态' },
  ]
})

const drawerVisible = ref(false)
const detailRow = ref<MerchantPaymentConfigItem | null>(null)

function invalidatePaymentConfigs(): void {
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.merchantPayment })
}

const auditMutation = useMutation({
  mutationFn: (variables: { id: number; approved: boolean; auditRemark?: string }) =>
    auditMerchantPaymentConfig(variables.id, { approved: variables.approved, auditRemark: variables.auditRemark }),
  onSuccess: (_data, variables) => {
    ElMessage.success(variables.approved ? '审核通过，该渠道已开通' : '已驳回，审核意见将展示给商户')
    invalidatePaymentConfigs()
  },
})

const statusMutation = useMutation({
  mutationFn: (variables: { id: number; status: MerchantPaymentSwitchStatus }) =>
    updateMerchantPaymentConfigStatus(variables.id, variables.status),
  onSuccess: (_data, variables) => {
    ElMessage.success(variables.status === 'enabled' ? '已启用该商户的该渠道' : '已停用该商户的该渠道')
    invalidatePaymentConfigs()
  },
})

/** not_applied 时后端还没有配置记录（id 为 null），任何审核与启停都无从下手 */
function configId(row: MerchantPaymentConfigItem): number | null {
  if (row.id === null) {
    ElMessage.warning('该商户尚未提交这条渠道的进件资料，平台端无法操作')
    return null
  }
  return row.id
}

/** 抽屉里的三渠道行来自单商户视图，后端不带商户名，弹窗文案要能兜底 */
function merchantLabel(row: MerchantPaymentConfigItem): string {
  return row.merchantName ?? `商户 #${row.merchantId}`
}

function guardAuditPermission(): boolean {
  if (canAudit.value) return true
  ElMessage.warning('没有商户支付审核权限')
  return false
}

async function approveRow(row: MerchantPaymentConfigItem): Promise<void> {
  if (!guardAuditPermission()) return
  const id = configId(row)
  if (id === null) return
  try {
    await ElMessageBox.confirm(
      `确认通过「${merchantLabel(row)}」的${row.channelLabel}进件？通过后该商户即可用${row.channelLabel}收款，` +
        `费率与结算账号按商户提交值生效。`,
      '审核通过',
      { type: 'warning', confirmButtonText: '确认通过', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  auditMutation.mutate({ id, approved: true })
}

/** 驳回意见必填：前端先校验，后端也会校验，校验失败由请求层弹出后端 message */
function rejectRemarkValidator(value: string): boolean | string {
  const text = (value ?? '').trim()
  if (text.length < 2) return '请填写至少 2 个字的审核意见'
  if (text.length > 200) return '审核意见不超过 200 字'
  return true
}

async function rejectRow(row: MerchantPaymentConfigItem): Promise<void> {
  if (!guardAuditPermission()) return
  const id = configId(row)
  if (id === null) return
  let remark = ''
  try {
    const data = await ElMessageBox.prompt(
      `驳回后「${merchantLabel(row)}」的${row.channelLabel}申请将退回商户，补齐资料后可重新提交。审核意见必填，商户端可见。`,
      `驳回${row.channelLabel}申请`,
      {
        inputType: 'textarea',
        inputPlaceholder: '例如：营业执照照片模糊，请重新上传清晰件',
        confirmButtonText: '确认驳回',
        cancelButtonText: '取消',
        inputValidator: rejectRemarkValidator,
      },
    )
    remark = data.value.trim()
  } catch {
    return
  }
  // 兜底二次校验：弹窗自身的 inputValidator 已拦一次，这里再保证空意见绝不外发
  const checked = rejectRemarkValidator(remark)
  if (checked !== true) {
    ElMessage.warning(typeof checked === 'string' ? checked : '驳回必须填写审核意见')
    return
  }
  auditMutation.mutate({ id, approved: false, auditRemark: remark })
}

async function switchStatus(row: MerchantPaymentConfigItem, next: MerchantPaymentSwitchStatus): Promise<void> {
  if (!guardAuditPermission()) return
  const id = configId(row)
  if (id === null) return
  const isEnable = next === 'enabled'
  const detail = isEnable
    ? `确认启用「${merchantLabel(row)}」的${row.channelLabel}？启用后商户端即可用该方式收款。`
    : `确认停用「${merchantLabel(row)}」的${row.channelLabel}？停用后该商户无法再通过${row.channelLabel}收款，已支付订单不受影响。`
  try {
    await ElMessageBox.confirm(detail, isEnable ? '启用支付渠道' : '停用支付渠道', {
      type: 'warning',
      confirmButtonText: '确认',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  statusMutation.mutate({ id, status: next })
}

function openDetail(row: MerchantPaymentConfigItem): void {
  detailRow.value = row
  drawerVisible.value = true
}

function applyCardFilter(card: SummaryCard): void {
  if (card.status === null) return
  status.value = status.value === card.status ? undefined : card.status
  page.value = DEFAULT_PAGE
}

function handleSearch(): void {
  page.value = DEFAULT_PAGE
}

function handleReset(): void {
  keyword.value = ''
  status.value = undefined
  channel.value = undefined
  merchantId.value = undefined
  page.value = DEFAULT_PAGE
}

const pending = computed(() => auditMutation.isPending.value || statusMutation.isPending.value)
</script>

<template>
  <div class="page-container">
    <div class="summary-grid">
      <el-card
        v-for="card in summaryCards"
        :key="card.key"
        class="page-card summary-card"
        :class="{ 'summary-card--active': card.status !== null && status === card.status, 'summary-card--static': card.status === null }"
        shadow="never"
        v-loading="summaryQuery.isPending.value"
        @click="applyCardFilter(card)"
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
          <el-select v-model="status" placeholder="全部状态" clearable class="toolbar-select" @change="handleSearch">
            <el-option
              v-for="item in MERCHANT_PAYMENT_FILTER_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <el-select v-model="channel" placeholder="全部渠道" clearable class="toolbar-select" @change="handleSearch">
            <el-option v-for="item in PAYMENT_CHANNEL_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-space>
        <el-button @click="listQuery.refetch()">
          <el-icon><Refresh /></el-icon>
          <span>刷新</span>
        </el-button>
      </div>

      <el-alert
        v-if="!canAudit"
        type="info"
        :closable="false"
        show-icon
        title="当前账号缺少 platform:merchant-payment:audit 权限，只能查看进件与开通情况"
        class="payment-alert"
      />

      <el-table v-loading="listQuery.isFetching.value" :data="rows" border stripe class="payment-table">
        <el-table-column label="商户" min-width="200">
          <template #default="{ row }: { row: MerchantPaymentConfigItem }">
            <div class="cell-text">
              <span class="text-ellipsis">{{ merchantLabel(row) }}</span>
              <p class="table-sub-text table-mono">{{ row.merchantCode }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="渠道" width="130">
          <template #default="{ row }: { row: MerchantPaymentConfigItem }">
            <div class="cell-text">
              <span>{{ row.channelLabel || dictLabel(PAYMENT_CHANNEL_DICT, row.channel) }}</span>
              <p class="table-sub-text table-mono">{{ row.channel }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="特约商户号" min-width="150">
          <template #default="{ row }: { row: MerchantPaymentConfigItem }">
            <span v-if="row.channelAccount" class="table-mono">{{ row.channelAccount }}</span>
            <span v-else class="text-muted">未提交</span>
          </template>
        </el-table-column>
        <el-table-column label="渠道费率" width="110" align="right">
          <template #default="{ row }: { row: MerchantPaymentConfigItem }">
            <div class="cell-text cell-text--right">
              <span>{{ formatPercent(row.feeRate) }}</span>
              <p v-if="row.feeRate !== null" class="table-sub-text table-mono">{{ row.feeRate }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="平台抽佣" width="110" align="right">
          <template #default="{ row }: { row: MerchantPaymentConfigItem }">
            <div class="cell-text cell-text--right">
              <span>{{ formatPercent(row.profitShareRate) }}</span>
              <p v-if="row.profitShareRate !== null" class="table-sub-text table-mono">{{ row.profitShareRate }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="结算账号" min-width="160">
          <template #default="{ row }: { row: MerchantPaymentConfigItem }">
            <div class="cell-text">
              <span v-if="row.settleAccountNoMasked" class="table-mono">{{ row.settleAccountNoMasked }}</span>
              <span v-else class="text-muted">未提交</span>
              <p v-if="row.settleAccountName" class="table-sub-text">{{ row.settleAccountName }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }: { row: MerchantPaymentConfigItem }">
            <StatusTag :item="MERCHANT_PAYMENT_STATUS_DICT[row.status]" />
          </template>
        </el-table-column>
        <el-table-column label="提交" min-width="150">
          <template #default="{ row }: { row: MerchantPaymentConfigItem }">
            <div v-if="row.appliedAt || row.appliedByName" class="cell-text">
              <span>{{ row.appliedByName || '商户侧提交' }}</span>
              <p class="table-sub-text"><TimeText :value="row.appliedAt" placeholder="未提交" /></p>
            </div>
            <span v-else class="text-muted">--</span>
          </template>
        </el-table-column>
        <el-table-column label="审核" min-width="150">
          <template #default="{ row }: { row: MerchantPaymentConfigItem }">
            <div v-if="row.auditedAt || row.auditedByName" class="cell-text">
              <span>{{ row.auditedByName || '平台审核' }}</span>
              <p class="table-sub-text"><TimeText :value="row.auditedAt" placeholder="未审核" /></p>
            </div>
            <span v-else class="text-muted">未审核</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right" align="right">
          <template #default="{ row }: { row: MerchantPaymentConfigItem }">
            <el-button v-if="row.id !== null" text type="primary" @click="openDetail(row)">
              <el-icon><View /></el-icon>
              <span>查看资料</span>
            </el-button>
            <el-button
              v-if="canAuditMerchantPayment(row.status) && canAudit"
              text
              type="success"
              :disabled="pending"
              @click="approveRow(row)"
            >
              <el-icon><Check /></el-icon>
              <span>通过</span>
            </el-button>
            <el-button
              v-if="canAuditMerchantPayment(row.status) && canAudit"
              text
              type="danger"
              :disabled="pending"
              @click="rejectRow(row)"
            >
              <el-icon><Close /></el-icon>
              <span>驳回</span>
            </el-button>
            <el-button
              v-if="canDisableMerchantPayment(row.status) && canAudit"
              text
              type="danger"
              :disabled="pending"
              @click="switchStatus(row, 'disabled')"
            >
              <el-icon><SwitchButton /></el-icon>
              <span>停用</span>
            </el-button>
            <el-button
              v-if="canEnableMerchantPayment(row.status) && canAudit"
              text
              type="success"
              :disabled="pending"
              @click="switchStatus(row, 'enabled')"
            >
              <el-icon><CircleCheck /></el-icon>
              <span>启用</span>
            </el-button>
            <span v-if="row.id === null" class="text-muted payment-none">未提交进件</span>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty
            :description="listQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '暂无商户支付开通记录'"
            :image-size="80"
          />
        </template>
      </el-table>

      <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" />
    </div>

    <MerchantPaymentDrawer
      v-model="drawerVisible"
      :record="detailRow"
      :busy="pending"
      :can-operate="canAudit"
      @approve="approveRow"
      @reject="rejectRow"
      @switch="switchStatus"
    />
  </div>
</template>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
}

.summary-card {
  cursor: pointer;
  border: 1px solid transparent;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.summary-card--active {
  border-color: #4f7cff;
  box-shadow: 0 0 0 2px rgb(79 124 255 / 12%);
}

.summary-card--static {
  cursor: default;
}

.summary-card__hint {
  margin: 2px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: #a8abb2;
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

.payment-table {
  padding: 0 16px;
}

.payment-alert {
  margin: 0 16px 8px;
}

.cell-text--right {
  align-items: flex-end;
}

.payment-none {
  font-size: 12px;
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
