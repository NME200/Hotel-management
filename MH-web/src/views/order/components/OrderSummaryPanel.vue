<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import { CircleClose, Clock, Coin, List, SuccessFilled } from '@element-plus/icons-vue'

import type { OrderSummary } from '@/api/types/order'
import { formatAmount, formatCount } from '@/utils/format'

const props = defineProps<{
  summary: OrderSummary | null | undefined
  loading: boolean
}>()

interface StatItem {
  key: string
  label: string
  value: string
  icon: Component
  color: string
}

const items = computed<StatItem[]>(() => {
  const summary = props.summary
  return [
    { key: 'orderCount', label: '订单总数', value: formatCount(summary?.orderCount), icon: List, color: '#4f7cff' },
    { key: 'turnover', label: '营业额', value: formatAmount(summary?.turnover), icon: Coin, color: '#67c23a' },
    { key: 'pendingCount', label: '待处理', value: formatCount(summary?.pendingCount), icon: Clock, color: '#e6a23c' },
    { key: 'completedCount', label: '已完成', value: formatCount(summary?.completedCount), icon: SuccessFilled, color: '#909399' },
    { key: 'cancelledCount', label: '已取消', value: formatCount(summary?.cancelledCount), icon: CircleClose, color: '#f56c6c' },
  ]
})
</script>

<template>
  <el-row :gutter="16">
    <el-col v-for="item in items" :key="item.key" :xs="12" :sm="8" :md="4">
      <el-card class="page-card stat" shadow="never" v-loading="loading">
        <div class="stat__icon" :style="{ background: `${item.color}1a`, color: item.color }">
          <el-icon :size="18"><component :is="item.icon" /></el-icon>
        </div>
        <div class="stat__body">
          <p class="stat__label">{{ item.label }}</p>
          <p class="stat__value">{{ item.value }}</p>
        </div>
      </el-card>
    </el-col>
  </el-row>
</template>

<style scoped>
.stat {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 16px;
}

.stat :deep(.el-card__body) {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
}

.stat__icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
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
</style>
