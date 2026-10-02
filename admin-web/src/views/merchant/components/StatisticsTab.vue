<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { Coin, Dish, Refresh, ShoppingBag, Ticket, User, UserFilled } from '@element-plus/icons-vue'

import { fetchMerchantStatistics } from '@/api/merchant-insight'
import { QUERY_KEYS } from '@/api/keys'
import { formatAmount, formatCount } from '@/utils/format'
import type { Component } from 'vue'

const props = defineProps<{ merchantId: number }>()

const statisticsQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.merchantInsight, props.merchantId, 'statistics']),
  queryFn: () => fetchMerchantStatistics(props.merchantId),
  enabled: computed(() => props.merchantId > 0),
})

interface StatCard {
  key: string
  label: string
  value: string
  unit: string
  icon: Component
  color: string
}

const cards = computed<StatCard[]>(() => {
  const data = statisticsQuery.data.value
  return [
    { key: 'dish', label: '菜品数', value: formatCount(data?.dishCount), unit: '个', icon: Dish, color: '#4f7cff' },
    { key: 'order', label: '订单总数', value: formatCount(data?.orderCount), unit: '单', icon: Ticket, color: '#67c23a' },
    { key: 'member', label: '会员总数', value: formatCount(data?.memberCount), unit: '人', icon: UserFilled, color: '#e6a23c' },
    { key: 'staff', label: '员工数', value: formatCount(data?.staffCount), unit: '人', icon: User, color: '#909399' },
    { key: 'turnover', label: '累计营业额', value: formatAmount(data?.totalTurnover), unit: '元', icon: Coin, color: '#f56c6c' },
    { key: 'last7', label: '近 7 天订单', value: formatCount(data?.last7Orders), unit: '单', icon: ShoppingBag, color: '#409eff' },
  ]
})
</script>

<template>
  <div class="stat">
    <el-alert
      v-if="statisticsQuery.isError.value"
      type="error"
      :closable="false"
      show-icon
      title="经营数据加载失败"
      :description="statisticsQuery.error.value?.message ?? '请确认后端服务可用后重试'"
    />

    <el-row :gutter="12">
      <el-col v-for="item in cards" :key="item.key" :xs="12" :sm="8">
        <div class="stat__card" v-loading="statisticsQuery.isPending.value">
          <span class="stat__icon" :style="{ background: `${item.color}1a`, color: item.color }">
            <el-icon :size="18"><component :is="item.icon" /></el-icon>
          </span>
          <div class="stat__body">
            <p class="stat__label">{{ item.label }}</p>
            <p class="stat__value">
              {{ item.value }}
              <span class="stat__unit">{{ item.unit }}</span>
            </p>
          </div>
        </div>
      </el-col>
    </el-row>

    <div class="stat__foot">
      <span class="text-muted">平台端仅可查看商户经营数据，如需修改请由商户在商家中心操作。</span>
      <el-button size="small" :loading="statisticsQuery.isFetching.value" @click="statisticsQuery.refetch()">
        <el-icon><Refresh /></el-icon>
        <span>刷新</span>
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.stat {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat__card {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px;
  margin-bottom: 12px;
  background: #f8fafe;
  border: 1px solid #eef1f6;
  border-radius: 8px;
}

.stat__icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
}

.stat__body {
  min-width: 0;
}

.stat__label {
  margin: 0 0 2px;
  font-size: 12px;
  color: #909399;
}

.stat__value {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.stat__unit {
  margin-left: 2px;
  font-size: 12px;
  font-weight: 400;
  color: #909399;
}

.stat__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 4px;
}
</style>
