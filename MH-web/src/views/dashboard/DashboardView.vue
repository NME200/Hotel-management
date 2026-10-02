<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { Coin, Dish, Ticket, UserFilled, Refresh, Warning } from '@element-plus/icons-vue'

import { fetchDashboardOverview } from '@/api/dashboard'
import type { DashboardOverview } from '@/api/types/dashboard'
import { QUERY_KEYS } from '@/api/keys'
import { PERMISSION } from '@/constants/permission'
import { formatAmount, formatCount, shortDate } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

const overviewQuery = useQuery({
  queryKey: QUERY_KEYS.dashboard,
  queryFn: () => fetchDashboardOverview(),
  enabled: computed(() => authStore.can(PERMISSION.dashboardRead)),
})

const overview = computed<DashboardOverview | null>(() => overviewQuery.data.value ?? null)

const trend = computed(() => overview.value?.orderTrend ?? [])
const hotDishes = computed(() => overview.value?.hotDishes ?? [])

const maxOrderCount = computed(() => trend.value.reduce((max, item) => Math.max(max, item.orderCount), 0))
const maxTurnover = computed(() => trend.value.reduce((max, item) => Math.max(max, item.turnover), 0))
const maxHotSales = computed(() => hotDishes.value.reduce((max, item) => Math.max(max, item.salesCount), 0))

const metrics = computed(() => [
  { key: 'order', label: '今日订单', value: formatCount(overview.value?.todayOrderCount), unit: '单', icon: Ticket, color: '#4f7cff' },
  { key: 'turnover', label: '今日营业额', value: formatAmount(overview.value?.todayTurnover), unit: '元', icon: Coin, color: '#67c23a' },
  { key: 'pending', label: '待处理订单', value: formatCount(overview.value?.pendingOrderCount), unit: '单', icon: Warning, color: '#e6a23c' },
  { key: 'member', label: '会员总数', value: formatCount(overview.value?.memberCount), unit: '人', icon: UserFilled, color: '#f56c6c' },
])

function barHeight(value: number, max: number): string {
  if (max <= 0) return '2%'
  return `${Math.max((value / max) * 100, 2).toFixed(1)}%`
}

function salesPercent(value: number): number {
  if (maxHotSales.value <= 0) return 0
  return Math.round((value / maxHotSales.value) * 100)
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
              <span>热销菜品榜</span>
              <span class="text-muted">共 {{ formatCount(overview?.dishCount) }} 个菜品</span>
            </div>
          </template>

          <ul v-if="hotDishes.length > 0" class="hot-dishes">
            <li v-for="(dish, index) in hotDishes" :key="dish.id" class="hot-dishes__item">
              <span class="hot-dishes__rank" :class="{ 'hot-dishes__rank--top': index < 3 }">{{ index + 1 }}</span>
              <div class="hot-dishes__main">
                <div class="hot-dishes__row">
                  <span class="text-ellipsis">{{ dish.name }}</span>
                  <span class="hot-dishes__sales">
                    <el-icon><Dish /></el-icon>
                    {{ formatCount(dish.salesCount) }}
                  </span>
                </div>
                <el-progress
                  :percentage="salesPercent(dish.salesCount)"
                  :show-text="false"
                  :stroke-width="6"
                  color="#4f7cff"
                />
              </div>
            </li>
          </ul>
          <el-empty v-else description="暂无热销数据" :image-size="72" />
        </el-card>
      </el-col>
    </el-row>
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

.hot-dishes {
  margin: 0;
  padding: 0;
  list-style: none;
}

.hot-dishes__item {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px dashed #eef1f6;
}

.hot-dishes__item:last-child {
  border-bottom: none;
}

.hot-dishes__rank {
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

.hot-dishes__rank--top {
  color: #fff;
  background: #e6a23c;
}

.hot-dishes__main {
  min-width: 0;
  flex: 1;
}

.hot-dishes__row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.hot-dishes__sales {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
  align-items: center;
  font-size: 12px;
  color: #909399;
}
</style>
