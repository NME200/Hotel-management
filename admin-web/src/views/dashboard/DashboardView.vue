<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { ArrowRight, Bottom, Coin, Refresh, Shop, Ticket, Timer, Top, UserFilled, Warning } from '@element-plus/icons-vue'

import { fetchPlatformOverview } from '@/api/dashboard'
import { fetchMerchants } from '@/api/merchant'
import { QUERY_KEYS } from '@/api/keys'
import type { PlatformOverview } from '@/api/types/dashboard'
import type { MerchantListItem } from '@/api/types/merchant'
import { DEFAULT_PAGE } from '@/constants/api'
import { MERCHANT_STATUS_DICT } from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { formatAmount, formatCount, formatRate, growthRate, shortDate } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import StatusTag from '@/components/common/StatusTag.vue'
import MerchantDetailDrawer from '@/views/merchant/components/MerchantDetailDrawer.vue'
import type { Component } from 'vue'

interface MetricCard {
  key: string
  label: string
  value: string
  unit: string
  icon: Component
  color: string
  delta?: string
  up?: boolean
}

const router = useRouter()
const authStore = useAuthStore()

const overviewQuery = useQuery({
  queryKey: QUERY_KEYS.dashboard,
  queryFn: () => fetchPlatformOverview(),
  enabled: computed(() => authStore.can(PERMISSION.dashboardRead)),
})

const overview = computed<PlatformOverview | null>(() => overviewQuery.data.value ?? null)

const trend = computed(() => overview.value?.orderTrend ?? [])
const topMerchants = computed(() => overview.value?.topMerchants ?? [])
const maxOrderCount = computed(() => trend.value.reduce((max, item) => Math.max(max, item.orderCount), 0))
const maxTurnover = computed(() => trend.value.reduce((max, item) => Math.max(max, item.turnover), 0))
const maxTopTurnover = computed(() => topMerchants.value.reduce((max, item) => Math.max(max, item.turnover), 0))

/** orderTrend 固定 7 项且末项为今日，昨日订单量取倒数第二项 */
const yesterdayOrderCount = computed(() => {
  if (trend.value.length < 2) return null
  return trend.value[trend.value.length - 2]?.orderCount ?? null
})

const turnoverRate = computed(() => {
  const data = overview.value
  if (!data) return null
  return growthRate(data.todayTurnover, data.yesterdayTurnover)
})

const orderRate = computed(() => {
  const data = overview.value
  if (!data || yesterdayOrderCount.value === null) return null
  return growthRate(data.todayOrderCount, yesterdayOrderCount.value)
})

const metrics = computed<MetricCard[]>(() => {
  const data = overview.value
  return [
    { key: 'total', label: '商户总数', value: formatCount(data?.merchantTotal), unit: '家', icon: Shop, color: '#4f7cff' },
    { key: 'active', label: '正常营业', value: formatCount(data?.merchantActive), unit: '家', icon: Ticket, color: '#67c23a' },
    { key: 'pending', label: '待审核商户', value: formatCount(data?.merchantPendingAudit), unit: '家', icon: Warning, color: '#e6a23c' },
    { key: 'expiring', label: '到期预警', value: formatCount(data?.expiringCount), unit: '家', icon: Timer, color: '#f56c6c' },
  ]
})

const todayCards = computed<MetricCard[]>(() => {
  const data = overview.value
  return [
    {
      key: 'todayOrder',
      label: '今日订单',
      value: formatCount(data?.todayOrderCount),
      unit: '单',
      icon: Ticket,
      color: '#4f7cff',
      delta: formatRate(orderRate.value),
      up: (orderRate.value ?? 0) >= 0,
    },
    {
      key: 'todayTurnover',
      label: '今日营业额',
      value: formatAmount(data?.todayTurnover),
      unit: '元',
      icon: Coin,
      color: '#67c23a',
      delta: formatRate(turnoverRate.value),
      up: (turnoverRate.value ?? 0) >= 0,
    },
    { key: 'orderTotal', label: '累计订单', value: formatCount(data?.orderTotal), unit: '单', icon: Shop, color: '#e6a23c' },
    { key: 'memberTotal', label: '全平台会员', value: formatCount(data?.memberTotal), unit: '人', icon: UserFilled, color: '#f56c6c' },
  ]
})

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

function barHeight(value: number, max: number): string {
  if (max <= 0) return '2%'
  return `${Math.max((value / max) * 100, 2).toFixed(1)}%`
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

    <el-row :gutter="16">
      <el-col v-for="item in metrics" :key="item.key" :xs="12" :sm="12" :md="6">
        <el-card class="page-card metric" shadow="never" v-loading="overviewQuery.isPending.value">
          <div class="metric__icon" :style="{ background: `${item.color}1a`, color: item.color }">
            <el-icon :size="20"><component :is="item.icon" /></el-icon>
          </div>
          <div class="metric__body">
            <p class="metric__label">{{ item.label }}</p>
            <p class="metric__value">
              {{ item.value }}
              <span class="metric__unit">{{ item.unit }}</span>
            </p>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col v-for="item in todayCards" :key="item.key" :xs="12" :sm="12" :md="6">
        <el-card class="page-card metric" shadow="never" v-loading="overviewQuery.isPending.value">
          <div class="metric__icon" :style="{ background: `${item.color}1a`, color: item.color }">
            <el-icon :size="20"><component :is="item.icon" /></el-icon>
          </div>
          <div class="metric__body">
            <p class="metric__label">{{ item.label }}</p>
            <p class="metric__value">
              {{ item.value }}
              <span class="metric__unit">{{ item.unit }}</span>
            </p>
            <p v-if="item.delta" class="metric__delta" :class="item.up ? 'is-up' : 'is-down'">
              <el-icon :size="12">
                <Top v-if="item.up" />
                <Bottom v-else />
              </el-icon>
              <span>较昨日 {{ item.delta }}</span>
            </p>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :xs="24" :md="16">
        <el-card class="page-card" shadow="never" v-loading="overviewQuery.isPending.value">
          <template #header>
            <div class="panel__header">
              <span>近 7 天订单与营业额趋势</span>
              <el-space size="small">
                <span class="legend legend--order">订单量</span>
                <span class="legend legend--turnover">营业额</span>
              </el-space>
            </div>
          </template>

          <div v-if="trend.length > 0" class="trend">
            <div v-for="point in trend" :key="point.date" class="trend__col">
              <div class="trend__bars">
                <el-tooltip :content="`${shortDate(point.date)} · ${point.orderCount} 单`" placement="top">
                  <span class="trend__bar trend__bar--order" :style="{ height: barHeight(point.orderCount, maxOrderCount) }" />
                </el-tooltip>
                <el-tooltip :content="`${shortDate(point.date)} · ¥${formatAmount(point.turnover)}`" placement="top">
                  <span class="trend__bar trend__bar--turnover" :style="{ height: barHeight(point.turnover, maxTurnover) }" />
                </el-tooltip>
              </div>
              <span class="trend__label">{{ shortDate(point.date) }}</span>
            </div>
          </div>
          <el-empty v-else description="暂无趋势数据" :image-size="72" />
        </el-card>
      </el-col>

      <el-col :xs="24" :md="8">
        <el-card class="page-card" shadow="never" v-loading="overviewQuery.isPending.value">
          <template #header>
            <div class="panel__header">
              <span>商户营业额榜</span>
              <span class="text-muted">菜品 {{ formatCount(overview?.dishTotal) }} 个</span>
            </div>
          </template>

          <ul v-if="topMerchants.length > 0" class="top-merchants">
            <li v-for="(item, index) in topMerchants" :key="item.merchantId" class="top-merchants__item">
              <span class="top-merchants__rank" :class="{ 'top-merchants__rank--top': index < 3 }">{{ index + 1 }}</span>
              <div class="top-merchants__main">
                <div class="top-merchants__row">
                  <span class="text-ellipsis">{{ item.merchantName }}</span>
                  <span class="top-merchants__value">{{ formatAmount(item.turnover) }} 元</span>
                </div>
                <el-progress
                  :percentage="turnoverPercent(item.turnover)"
                  :show-text="false"
                  :stroke-width="6"
                  color="#4f7cff"
                />
                <p class="table-sub-text">{{ item.orderCount }} 单</p>
              </div>
            </li>
          </ul>
          <el-empty v-else description="暂无商户营业额数据" :image-size="72" />
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :xs="24" :md="12">
        <el-card class="page-card" shadow="never">
          <template #header>
            <div class="panel__header">
              <span>待审核商户</span>
              <el-button text type="primary" @click="goMerchantList">
                <span>前往审核</span>
                <el-icon><ArrowRight /></el-icon>
              </el-button>
            </div>
          </template>

          <div v-loading="pendingQuery.isFetching.value">
            <ul v-if="pendingRows.length > 0" class="pending-list">
              <li v-for="row in pendingRows" :key="row.id" class="pending-list__item">
                <div class="cell-text">
                  <span class="text-ellipsis">{{ row.name }}</span>
                  <p class="table-sub-text table-mono">{{ row.code }}</p>
                </div>
                <StatusTag :item="MERCHANT_STATUS_DICT[row.status]" />
                <el-button text type="primary" size="small" @click="openPendingMerchant(row)">查看</el-button>
              </li>
            </ul>
            <el-empty v-else description="暂无待审核商户" :image-size="60" />
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12">
        <el-card class="page-card" shadow="never">
          <template #header>
            <div class="panel__header">
              <span>到期预警</span>
              <el-button text type="primary" @click="goExpiring">
                <span>查看预警清单</span>
                <el-icon><ArrowRight /></el-icon>
              </el-button>
            </div>
          </template>
          <div class="expiring-summary">
            <p class="expiring-summary__value">{{ formatCount(overview?.expiringCount) }}</p>
            <p class="expiring-summary__label">需跟进续约的商户数（口径与后端 overview 一致）</p>
            <p class="text-muted expiring-summary__tip">
              到期后商户状态会被置为「已过期」，小程序端将无法点餐，请提前联系商户续费。
            </p>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <MerchantDetailDrawer v-model="drawerVisible" :merchant-id="detailMerchantId" />
  </div>
</template>

<style scoped>
.metric {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.metric :deep(.el-card__body) {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.metric__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 10px;
}

.metric__body {
  min-width: 0;
}

.metric__label {
  margin: 0 0 4px;
  font-size: 13px;
  color: #909399;
}

.metric__value {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.2;
}

.metric__unit {
  margin-left: 4px;
  font-size: 12px;
  font-weight: 400;
  color: #909399;
}

.metric__delta {
  display: flex;
  gap: 2px;
  align-items: center;
  margin: 4px 0 0;
  font-size: 12px;
}

.metric__delta.is-up {
  color: #67c23a;
}

.metric__delta.is-down {
  color: #f56c6c;
}

.panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 15px;
  font-weight: 600;
}

.legend {
  padding-left: 12px;
  font-size: 12px;
  font-weight: 400;
  color: #606266;
}

.legend::before {
  position: absolute;
  width: 8px;
  height: 8px;
  margin-left: -12px;
  border-radius: 2px;
  content: '';
}

.legend--order::before {
  background: #4f7cff;
}

.legend--turnover::before {
  background: #67c23a;
}

.trend {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  height: 240px;
  padding-top: 8px;
}

.trend__col {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  height: 100%;
  gap: 8px;
}

.trend__bars {
  display: flex;
  flex: 1;
  gap: 6px;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
}

.trend__bar {
  width: 16px;
  border-radius: 4px 4px 0 0;
  transition: height 0.3s ease;
}

.trend__bar--order {
  background: #4f7cff;
}

.trend__bar--turnover {
  background: #67c23a;
  opacity: 0.75;
}

.trend__label {
  font-size: 12px;
  color: #909399;
}

.top-merchants {
  margin: 0;
  padding: 0;
  list-style: none;
}

.top-merchants__item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px dashed #eef1f6;
}

.top-merchants__item:last-child {
  border-bottom: none;
}

.top-merchants__rank {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  font-size: 12px;
  color: #606266;
  background: #f0f2f5;
  border-radius: 50%;
}

.top-merchants__rank--top {
  color: #fff;
  background: #e6a23c;
}

.top-merchants__main {
  flex: 1;
  min-width: 0;
}

.top-merchants__row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.top-merchants__value {
  flex-shrink: 0;
  font-size: 12px;
  color: #4f7cff;
}

.pending-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.pending-list__item {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px dashed #eef1f6;
}

.pending-list__item:last-child {
  border-bottom: none;
}

.pending-list__item .cell-text {
  flex: 1;
  min-width: 0;
}

.expiring-summary {
  padding: 8px 4px;
  text-align: center;
}

.expiring-summary__value {
  margin: 0;
  font-size: 34px;
  font-weight: 600;
  color: #f56c6c;
}

.expiring-summary__label {
  margin: 4px 0 8px;
  font-size: 13px;
  color: #606266;
}

.expiring-summary__tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
}
</style>
