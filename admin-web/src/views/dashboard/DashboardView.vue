<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { ArrowRight, CircleCheck, Coin, Refresh, Shop, Timer, Tickets, TrendCharts, UserFilled, Warning } from '@element-plus/icons-vue'

import { fetchPlatformOverview } from '@/api/dashboard'
import { fetchMerchants } from '@/api/merchant'
import { QUERY_KEYS } from '@/api/keys'
import type { PlatformOverview } from '@/api/types/dashboard'
import type { MerchantListItem } from '@/api/types/merchant'
import { DEFAULT_PAGE } from '@/constants/api'
import { MERCHANT_STATUS_DICT } from '@/constants/dictionary'
import { TIME_PATTERN } from '@/constants/date-patterns'
import { PERMISSION } from '@/constants/permission'
import { formatAmount, formatCount, formatDateTime, growthRate } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import StatusTag from '@/components/common/StatusTag.vue'
import MerchantDetailDrawer from '@/views/merchant/components/MerchantDetailDrawer.vue'
import MetricCard from './components/MetricCard.vue'
import TrendChart from './components/TrendChart.vue'

const router = useRouter()
const authStore = useAuthStore()

const overviewQuery = useQuery({
  queryKey: QUERY_KEYS.dashboard,
  queryFn: () => fetchPlatformOverview(),
  enabled: computed(() => authStore.can(PERMISSION.dashboardRead)),
})

const overview = computed<PlatformOverview | null>(() => overviewQuery.data.value ?? null)
const loading = computed(() => overviewQuery.isPending.value)

const trend = computed(() => overview.value?.orderTrend ?? [])
const topMerchants = computed(() => overview.value?.topMerchants ?? [])
const maxTopTurnover = computed(() => topMerchants.value.reduce((max, item) => Math.max(max, item.turnover), 0))

/** orderTrend 固定 7 项且末项为今日，昨日订单量取倒数第二项 */
const yesterdayOrderCount = computed(() =>
  trend.value.length < 2 ? null : trend.value[trend.value.length - 2]?.orderCount ?? null,
)

const orderRate = computed(() => {
  const data = overview.value
  if (!data || yesterdayOrderCount.value === null) return null
  return growthRate(data.todayOrderCount, yesterdayOrderCount.value)
})

const turnoverRate = computed(() => {
  const data = overview.value
  if (!data) return null
  return growthRate(data.todayTurnover, data.yesterdayTurnover)
})

/** 趋势面板副标题：给一个能一眼判断这周好不好的参照 */
const trendCaption = computed(() => {
  if (trend.value.length === 0) return ''
  const totalOrder = trend.value.reduce((sum, item) => sum + item.orderCount, 0)
  const peak = trend.value.reduce((max, item) => Math.max(max, item.turnover), 0)
  return `日均 ${(totalOrder / trend.value.length).toFixed(1)} 单 · 单日营业额峰值 ¥${formatAmount(peak)}`
})

const refreshedAt = computed(() => {
  const at = overviewQuery.dataUpdatedAt.value
  return at ? formatDateTime(new Date(at).toISOString(), TIME_PATTERN) : '--'
})

/**
 * 商户构成。`expiringCount` 是「30 天内到期 + 已过期未停用」的营业中商户，
 * 本身含在 `merchantActive` 里，所以它不进堆叠条，只单独列一行说明。
 */
const merchantMix = computed(() => {
  const data = overview.value
  const total = data?.merchantTotal ?? 0
  const active = data?.merchantActive ?? 0
  const pending = data?.merchantPendingAudit ?? 0
  const rows = [
    { key: 'active', label: '正常营业', value: active, color: '#2fa66a', to: '/merchant' as string | null },
    {
      key: 'pending',
      label: '待审核',
      value: pending,
      color: '#e6a23c',
      to: '/merchant?status=pending_audit',
    },
    { key: 'other', label: '其他状态', value: Math.max(total - active - pending, 0), color: '#c8ccd6', to: null },
  ]
  return { total, rows }
})

function percentOf(value: number): number {
  const total = merchantMix.value.total
  return total <= 0 ? 0 : Math.round((value / total) * 100)
}

/** 堆叠条里为 0 的一段不留痕迹，非 0 的最小给 3% 才看得见 */
function widthOf(value: number): string {
  if (value <= 0) return '0%'
  return `${Math.max(percentOf(value), 3)}%`
}

/** 待审核商户快捷入口：只取前 5 条，完整列表在商户管理页 */
const pendingQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.merchants, 'pending-brief']),
  queryFn: () =>
    fetchMerchants({
      status: 'pending_audit',
      page: DEFAULT_PAGE,
      pageSize: 5,
    }),
  enabled: computed(() => authStore.can(PERMISSION.merchantRead)),
  placeholderData: keepPreviousData,
})

const pendingRows = computed<MerchantListItem[]>(() => pendingQuery.data.value?.list ?? [])

const drawerVisible = ref(false)
const detailMerchantId = ref<number | null>(null)

function openPendingMerchant(row: MerchantListItem): void {
  detailMerchantId.value = row.id
  drawerVisible.value = true
}

function goMerchantList(): void {
  void router.push({ path: '/merchant', query: { status: 'pending_audit' } })
}

function goExpiring(): void {
  void router.push('/expiring')
}

function turnoverPercent(value: number): number {
  if (maxTopTurnover.value <= 0) return 0
  return Math.round((value / maxTopTurnover.value) * 100)
}
</script>

<template>
  <div class="page-container">
    <el-alert
      v-if="overviewQuery.isError.value"
      type="error"
      :closable="false"
      show-icon
      title="平台看板数据加载失败"
      :description="overviewQuery.error.value?.message ?? '请确认后端服务可用后重试'"
    >
      <template #default>
        <el-button size="small" :loading="overviewQuery.isFetching.value" @click="overviewQuery.refetch()">
          <el-icon><Refresh /></el-icon>
          <span>重新加载</span>
        </el-button>
      </template>
    </el-alert>

    <div class="board-head">
      <div class="board-head__title">
        <h2>平台经营概览</h2>
        <p>
          数据截至 {{ refreshedAt }}
          <el-button text size="small" :loading="overviewQuery.isFetching.value" @click="overviewQuery.refetch()">
            <el-icon><Refresh /></el-icon>
            <span>刷新</span>
          </el-button>
        </p>
      </div>
      <div class="board-head__todo">
        <button type="button" class="todo" :class="{ 'todo--muted': !overview?.merchantPendingAudit }" @click="goMerchantList">
          <el-icon><Warning /></el-icon>
          <span>待审核商户</span>
          <b>{{ formatCount(overview?.merchantPendingAudit) }}</b>
          <span class="todo__unit">家</span>
        </button>
        <button type="button" class="todo" :class="{ 'todo--danger': overview?.expiringCount }" @click="goExpiring">
          <el-icon><Timer /></el-icon>
          <span>到期预警</span>
          <b>{{ formatCount(overview?.expiringCount) }}</b>
          <span class="todo__unit">家</span>
        </button>
      </div>
    </div>

    <div class="kpi-grid">
      <MetricCard
        label="商户总数"
        :value="formatCount(overview?.merchantTotal)"
        unit="家"
        :icon="Shop"
        tone="brand"
        :hint="`其中正常营业 ${formatCount(overview?.merchantActive)} 家`"
        :loading="loading"
        clickable
        @click="router.push('/merchant')"
      />
      <MetricCard
        label="今日订单"
        :value="formatCount(overview?.todayOrderCount)"
        unit="单"
        :icon="Tickets"
        tone="brand"
        :rate="orderRate"
        :loading="loading"
      />
      <MetricCard
        label="今日营业额"
        :value="formatAmount(overview?.todayTurnover)"
        unit="元"
        :icon="Coin"
        tone="success"
        :rate="turnoverRate"
        :loading="loading"
      />
      <MetricCard
        label="全平台会员"
        :value="formatCount(overview?.memberTotal)"
        unit="人"
        :icon="UserFilled"
        tone="warning"
        :hint="`累计订单 ${formatCount(overview?.orderTotal)} 单 · 菜品 ${formatCount(overview?.dishTotal)} 个`"
        :loading="loading"
      />
    </div>

    <div class="panel-grid">
      <el-card class="page-card panel" shadow="never" v-loading="loading">
        <template #header>
          <div class="panel__header">
            <span class="panel__title">
              <el-icon class="panel__title-icon"><TrendCharts /></el-icon>
              近 7 天订单与营业额
            </span>
            <span class="panel__caption">{{ trendCaption }}</span>
          </div>
        </template>
        <TrendChart :points="trend" />
      </el-card>

      <el-card class="page-card panel" shadow="never" v-loading="loading">
        <template #header>
          <div class="panel__header">
            <span class="panel__title">
              <el-icon class="panel__title-icon"><Shop /></el-icon>
              商户构成
            </span>
            <span class="panel__caption">共 {{ formatCount(merchantMix.total) }} 家</span>
          </div>
        </template>

        <div class="mix">
          <span
            v-for="row in merchantMix.rows"
            :key="row.key"
            class="mix__seg"
            :style="{ width: widthOf(row.value), background: row.color }"
          />
        </div>

        <ul class="mix__rows">
          <li v-for="row in merchantMix.rows" :key="row.key" class="mix__row">
            <span class="mix__dot" :style="{ background: row.color }" />
            <span class="mix__label">{{ row.label }}</span>
            <span class="mix__value">{{ formatCount(row.value) }} 家</span>
            <span class="mix__percent">{{ percentOf(row.value) }}%</span>
            <el-button v-if="row.to" text type="primary" size="small" @click="router.push(row.to)">
              <el-icon><ArrowRight /></el-icon>
            </el-button>
          </li>
        </ul>

        <div class="mix__alert" :class="{ 'mix__alert--clean': !overview?.expiringCount }">
          <el-icon><Timer /></el-icon>
          <div class="mix__alert-body">
            <p class="mix__alert-text">
              到期预警
              <b>{{ formatCount(overview?.expiringCount) }}</b>
              家
            </p>
            <p class="mix__alert-tip">30 天内到期 / 已过期未停用</p>
          </div>
          <el-button text type="primary" size="small" @click="goExpiring">查看清单</el-button>
        </div>

        <p class="mix__note">到期预警是「正常营业」的子集，不重复计入上面的构成。</p>
      </el-card>
    </div>

    <div class="panel-grid">
      <el-card class="page-card panel" shadow="never">
        <template #header>
          <div class="panel__header">
            <span class="panel__title">
              <el-icon class="panel__title-icon"><Warning /></el-icon>
              待审核商户
            </span>
            <el-button text type="primary" @click="goMerchantList">
              <span>前往审核</span>
              <el-icon><ArrowRight /></el-icon>
            </el-button>
          </div>
        </template>

        <div v-loading="pendingQuery.isFetching.value">
          <ul v-if="pendingRows.length > 0" class="rows">
            <li v-for="row in pendingRows" :key="row.id" class="rows__item" @click="openPendingMerchant(row)">
              <div class="rows__main">
                <span class="text-ellipsis">{{ row.name }}</span>
                <p class="table-sub-text table-mono">{{ row.code }}</p>
              </div>
              <StatusTag :item="MERCHANT_STATUS_DICT[row.status]" />
            </li>
          </ul>
          <div v-else class="panel__empty">
            <el-icon class="panel__empty-icon"><CircleCheck /></el-icon>
            <span>没有积压的进件审核</span>
          </div>
        </div>
      </el-card>

      <el-card class="page-card panel" shadow="never" v-loading="loading">
        <template #header>
          <div class="panel__header">
            <span class="panel__title">
              <el-icon class="panel__title-icon"><Coin /></el-icon>
              商户营业额榜
            </span>
            <span class="panel__caption">近 7 天前 {{ topMerchants.length }} 名</span>
          </div>
        </template>

        <ul v-if="topMerchants.length > 0" class="rows rows--rank">
          <li v-for="(item, index) in topMerchants" :key="item.merchantId" class="rows__rank">
            <span class="rows__rank-no" :class="{ 'rows__rank-no--top': index < 3 }">{{ index + 1 }}</span>
            <div class="rows__main">
              <div class="rows__line">
                <span class="text-ellipsis">{{ item.merchantName }}</span>
                <span class="rows__amount">¥{{ formatAmount(item.turnover) }}</span>
              </div>
              <div class="rows__track">
                <span class="rows__fill" :style="{ width: `${turnoverPercent(item.turnover)}%` }" />
              </div>
              <p class="table-sub-text">{{ formatCount(item.orderCount) }} 单</p>
            </div>
          </li>
        </ul>
        <div v-else class="panel__empty">
          <el-icon class="panel__empty-icon"><Coin /></el-icon>
          <span>近 7 天还没有成交</span>
        </div>
      </el-card>
    </div>

    <MerchantDetailDrawer v-model="drawerVisible" :merchant-id="detailMerchantId" />
  </div>
</template>

<style scoped>
/* ---------- 顶部概览条 ---------- */
.board-head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  justify-content: space-between;
}

.board-head__title h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.board-head__title p {
  display: flex;
  align-items: center;
  gap: 2px;
  margin: 4px 0 0;
  font-size: 12px;
  color: #909399;
}

.board-head__todo {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.todo {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 7px 14px;
  font-size: 13px;
  color: #4b5563;
  cursor: pointer;
  background: #fff;
  border: 1px solid #eef1f6;
  border-radius: 999px;
  transition: all 0.2s ease;
}

.todo b {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  color: #1f2937;
}

.todo__unit {
  font-size: 12px;
  color: #909399;
}

.todo:hover {
  border-color: #c9d5ff;
  box-shadow: 0 4px 14px rgb(15 23 42 / 6%);
}

.todo--danger {
  color: #d9534f;
  background: rgba(245, 108, 108, 0.06);
  border-color: rgba(245, 108, 108, 0.3);
}

.todo--danger b {
  color: #f56c6c;
}

.todo--muted {
  color: #909399;
}

/* ---------- KPI 与面板栅格 ---------- */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.panel-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 16px;
}

.panel {
  height: 100%;
}

.panel :deep(.el-card__header) {
  padding: 14px 18px;
  border-bottom: 1px solid #f2f4f8;
}

.panel :deep(.el-card__body) {
  padding: 16px 18px 18px;
}

.panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel__title {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}

.panel__title-icon {
  color: #4f7cff;
}

.panel__caption {
  font-size: 12px;
  color: #909399;
}

/* ---------- 商户构成 ---------- */
.mix {
  display: flex;
  gap: 2px;
  height: 10px;
  overflow: hidden;
  background: #f2f4f8;
  border-radius: 6px;
}

.mix__seg {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.mix__rows {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.mix__row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 7px 0;
  font-size: 13px;
  border-bottom: 1px dashed #f2f4f8;
}

.mix__row:last-child {
  border-bottom: none;
}

.mix__dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.mix__label {
  flex: 1;
  color: #4b5563;
}

.mix__value {
  font-variant-numeric: tabular-nums;
  color: #1f2937;
}

.mix__percent {
  width: 42px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: #909399;
  text-align: right;
}

.mix__alert {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 12px;
  padding: 10px 12px;
  color: #d9534f;
  background: rgba(245, 108, 108, 0.07);
  border-radius: 8px;
}

.mix__alert--clean {
  color: #2fa66a;
  background: rgba(47, 166, 106, 0.07);
}

.mix__alert-body {
  flex: 1;
  min-width: 0;
}

.mix__alert-text {
  margin: 0;
  font-size: 13px;
}

.mix__alert-text b {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.mix__alert-tip {
  margin: 2px 0 0;
  font-size: 12px;
  color: #98a2b3;
}

.mix__note {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #a8abb2;
}

.panel__empty {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  min-height: 132px;
  font-size: 13px;
  color: #909399;
}

.panel__empty-icon {
  color: #2fa66a;
}

/* ---------- 列表与榜单 ---------- */
.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.rows__item {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  padding: 9px 8px;
  margin: 0 -8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.rows__item:hover {
  background: #f7f9fc;
}

.rows__main {
  flex: 1;
  min-width: 0;
  font-size: 14px;
}

.rows--rank .rows__rank {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 9px 0;
  border-bottom: 1px dashed #f2f4f8;
}

.rows--rank .rows__rank:last-child {
  border-bottom: none;
}

.rows__rank-no {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: #606266;
  background: #f0f2f5;
  border-radius: 6px;
}

.rows__rank-no--top {
  color: #fff;
  background: linear-gradient(135deg, #ffb64d, #f5842c);
}

.rows--rank .rows__main {
  flex: 1;
  min-width: 0;
}

.rows__line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.rows__amount {
  flex-shrink: 0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: #4f7cff;
}

.rows__track {
  height: 5px;
  overflow: hidden;
  background: #eef1f6;
  border-radius: 999px;
}

.rows__fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #7f9dff, #4f7cff);
  border-radius: 999px;
  transition: width 0.3s ease;
}

.rows--rank .table-sub-text {
  margin-top: 4px;
}

@media (max-width: 1200px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .panel-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 720px) {
  .kpi-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
