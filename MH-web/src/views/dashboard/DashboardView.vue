<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { Coin, Dish, Refresh, ShoppingBag, Tickets, Timer, TrendCharts, UserFilled } from '@element-plus/icons-vue'

import { fetchDashboardOverview } from '@/api/dashboard'
import type { DashboardOverview } from '@/api/types/dashboard'
import { QUERY_KEYS } from '@/api/keys'
import { TIME_PATTERN } from '@/constants/date-patterns'
import { PERMISSION } from '@/constants/permission'
import { formatAmount, formatCount, formatDateTime, growthRate } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import MetricCard from './components/MetricCard.vue'
import TrendChart from './components/TrendChart.vue'

const router = useRouter()
const authStore = useAuthStore()

const overviewQuery = useQuery({
  queryKey: QUERY_KEYS.dashboard,
  queryFn: () => fetchDashboardOverview(),
  enabled: computed(() => authStore.can(PERMISSION.dashboardRead)),
})

const overview = computed<DashboardOverview | null>(() => overviewQuery.data.value ?? null)
const loading = computed(() => overviewQuery.isPending.value)

const trend = computed(() => overview.value?.orderTrend ?? [])
const hotDishes = computed(() => overview.value?.hotDishes ?? [])
const maxHotSales = computed(() => hotDishes.value.reduce((max, item) => Math.max(max, item.salesCount), 0))

/**
 * 环比的「昨日」取自趋势数组倒数第二项（末项是今日）。
 * 接口没单独给昨日值，但这两项本来就是同一份统计，不必为此加字段。
 */
const yesterday = computed(() =>
  trend.value.length < 2 ? null : trend.value[trend.value.length - 2] ?? null,
)

const orderRate = computed(() => {
  const data = overview.value
  if (!data || !yesterday.value) return null
  return growthRate(data.todayOrderCount, yesterday.value.orderCount)
})

const turnoverRate = computed(() => {
  const data = overview.value
  if (!data || !yesterday.value) return null
  return growthRate(data.todayTurnover, yesterday.value.turnover)
})

const trendCaption = computed(() => {
  if (trend.value.length === 0) return ''
  const total = trend.value.reduce((sum, item) => sum + item.orderCount, 0)
  const peak = trend.value.reduce((max, item) => Math.max(max, item.turnover), 0)
  return `日均 ${(total / trend.value.length).toFixed(1)} 单 · 单日营业额峰值 ¥${formatAmount(peak)}`
})

const refreshedAt = computed(() => {
  const at = overviewQuery.dataUpdatedAt.value
  return at ? formatDateTime(new Date(at).toISOString(), TIME_PATTERN) : '--'
})

/** 热销榜的销量占比：按累计销量排，最大那条铺满，其余按比例 */
function salesPercent(value: number): number {
  if (maxHotSales.value <= 0) return 0
  return Math.max(Math.round((value / maxHotSales.value) * 100), 2)
}

function goOrders(): void {
  void router.push('/order')
}

function goDishes(): void {
  void router.push('/dish')
}
</script>

<template>
  <div class="page-container">
    <el-alert
      v-if="overviewQuery.isError.value"
      type="error"
      :closable="false"
      show-icon
      title="看板数据加载失败"
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
        <h2>今日经营概览</h2>
        <p>
          数据截至 {{ refreshedAt }}
          <el-button text size="small" :loading="overviewQuery.isFetching.value" @click="overviewQuery.refetch()">
            <el-icon><Refresh /></el-icon>
            <span>刷新</span>
          </el-button>
        </p>
      </div>
      <button
        type="button"
        class="todo"
        :class="{ 'todo--danger': (overview?.pendingOrderCount ?? 0) > 0 }"
        @click="goOrders"
      >
        <el-icon><Timer /></el-icon>
        <span>待处理订单</span>
        <b>{{ formatCount(overview?.pendingOrderCount) }}</b>
        <span class="todo__unit">单</span>
      </button>
    </div>

    <div class="kpi-grid">
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
        label="待处理订单"
        :value="formatCount(overview?.pendingOrderCount)"
        unit="单"
        :icon="ShoppingBag"
        :tone="(overview?.pendingOrderCount ?? 0) > 0 ? 'danger' : 'neutral'"
        hint="已下单待接单，去订单页处理"
        :loading="loading"
        clickable
        @click="goOrders"
      />
      <MetricCard
        label="会员总数"
        :value="formatCount(overview?.memberCount)"
        unit="人"
        :icon="UserFilled"
        tone="warning"
        :hint="`在售菜品 ${formatCount(overview?.dishCount)} 个`"
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
              <el-icon class="panel__title-icon"><Dish /></el-icon>
              热销菜品
            </span>
            <el-button text type="primary" size="small" @click="goDishes">
              <span>菜品管理</span>
            </el-button>
          </div>
        </template>

        <ul v-if="hotDishes.length > 0" class="rows">
          <li v-for="(dish, index) in hotDishes" :key="dish.id" class="rows__rank">
            <span class="rows__rank-no" :class="{ 'rows__rank-no--top': index < 3 }">{{ index + 1 }}</span>
            <div class="rows__main">
              <div class="rows__line">
                <span class="text-ellipsis">{{ dish.name }}</span>
                <span class="rows__amount">{{ formatCount(dish.salesCount) }} 份</span>
              </div>
              <div class="rows__track">
                <span class="rows__fill" :style="{ width: `${salesPercent(dish.salesCount)}%` }" />
              </div>
            </div>
          </li>
        </ul>
        <div v-else class="panel__empty">
          <el-icon class="panel__empty-icon"><Dish /></el-icon>
          <span>还没有菜品卖出过</span>
        </div>

        <p class="panel__foot-tip">按菜品累计销量排序，不是近 7 天销量</p>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
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

.panel__foot-tip {
  margin: 12px 0 0;
  font-size: 12px;
  color: #98a2b3;
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

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.rows__rank {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px dashed #f2f4f8;
}

.rows__rank:last-child {
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

.rows__main {
  flex: 1;
  min-width: 0;
}

.rows__line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 14px;
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
