<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, Bottom, Top } from '@element-plus/icons-vue'
import type { Component } from 'vue'

import { formatRate } from '@/utils/format'

type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral'

const props = withDefaults(
  defineProps<{
    label: string
    value: string
    unit?: string
    icon?: Component
    tone?: Tone
    /** 环比百分比数值（`growthRate` 的结果）；null 时不显示环比，退回 hint */
    rate?: number | null
    rateCaption?: string
    /** 没有环比时的副文案 */
    hint?: string
    loading?: boolean
    /** 可跳转的卡片：右侧出一个箭头，整卡可点 */
    clickable?: boolean
  }>(),
  { unit: '', tone: 'brand', rate: undefined, rateCaption: '较昨日', hint: '', clickable: false, loading: false },
)

const emit = defineEmits<{ click: [] }>()

const TONES: Record<Tone, string> = {
  brand: '#4f7cff',
  success: '#2fa66a',
  warning: '#e6a23c',
  danger: '#f56c6c',
  neutral: '#8a94a6',
}

const accent = computed(() => TONES[props.tone])
const iconStyle = computed(() => ({ background: `${accent.value}1a`, color: accent.value }))
const rateText = computed(() => formatRate(props.rate ?? null))
const hasRate = computed(() => props.rate !== undefined && props.rate !== null)
const up = computed(() => (props.rate ?? 0) >= 0)
const rateStyle = computed(() =>
  up.value
    ? { background: 'rgba(47, 166, 106, 0.1)', color: '#2fa66a' }
    : { background: 'rgba(245, 108, 108, 0.1)', color: '#f56c6c' },
)
</script>

<template>
  <div
    class="metric"
    :class="{ 'metric--clickable': clickable }"
    :style="{ '--metric-accent': accent }"
    v-loading="loading"
    :tabindex="clickable ? 0 : undefined"
    @click="clickable && emit('click')"
    @keydown.enter="clickable && emit('click')"
  >
    <div class="metric__head">
      <span class="metric__label">{{ label }}</span>
      <span v-if="icon" class="metric__icon" :style="iconStyle">
        <el-icon :size="18"><component :is="icon" /></el-icon>
      </span>
    </div>

    <p class="metric__value">
      {{ value }}
      <span v-if="unit" class="metric__unit">{{ unit }}</span>
    </p>

    <div class="metric__foot">
      <span v-if="hasRate" class="metric__rate" :style="rateStyle">
        <el-icon :size="12"><Top v-if="up" /><Bottom v-else /></el-icon>
        <span>{{ rateText }}</span>
        <span class="metric__rate-caption">{{ rateCaption }}</span>
      </span>
      <span v-else class="metric__hint">{{ hint }}</span>
      <el-icon v-if="clickable" class="metric__arrow" :size="14"><ArrowRight /></el-icon>
    </div>
  </div>
</template>

<style scoped>
.metric {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 100%;
  padding: 16px 18px;
  background: #fff;
  border: 1px solid #eef1f6;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgb(15 23 42 / 4%);
  transition: box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease;
}

.metric:hover {
  border-color: color-mix(in srgb, var(--metric-accent) 30%, #eef1f6);
  box-shadow: 0 8px 22px rgb(15 23 42 / 8%);
}

.metric--clickable {
  cursor: pointer;
}

.metric--clickable:focus-visible {
  outline: 2px solid var(--metric-accent);
  outline-offset: 2px;
}

.metric__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.metric__label {
  font-size: 13px;
  color: #6b7280;
}

.metric__icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
}

.metric__value {
  margin: 0;
  font-size: 26px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
  color: #1f2937;
}

.metric__unit {
  margin-left: 4px;
  font-size: 13px;
  font-weight: 400;
  color: #909399;
}

.metric__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 22px;
}

.metric__rate {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  padding: 1px 8px 1px 6px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  border-radius: 999px;
}

.metric__rate-caption {
  color: #98a2b3;
}

.metric__hint {
  overflow: hidden;
  font-size: 12px;
  color: #909399;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric__arrow {
  color: #c0c4cc;
  transition: color 0.2s ease, transform 0.2s ease;
}

.metric--clickable:hover .metric__arrow {
  color: var(--metric-accent);
  transform: translateX(2px);
}
</style>
