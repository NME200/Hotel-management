<script setup lang="ts">
import { computed } from 'vue'

import { formatDate, formatDateTime } from '@/utils/format'

/** 表格里统一的时间列：ISO 字符串 -> 本地可读时间（YYYY-MM-DD HH:mm:ss），空值按占位符展示 */
const props = withDefaults(
  defineProps<{
    value?: string | null
    /** 'date' 只展示到日，默认展示到秒 */
    mode?: 'datetime' | 'date'
    /** 空值时的占位文案 */
    placeholder?: string
  }>(),
  {
    value: null,
    mode: 'datetime',
    placeholder: '--',
  },
)

const isEmpty = computed(() => !props.value)

const displayText = computed(() => {
  if (isEmpty.value) return props.placeholder
  return props.mode === 'date' ? formatDate(props.value) : formatDateTime(props.value)
})
</script>

<template>
  <span :class="{ 'text-muted': isEmpty }">{{ displayText }}</span>
</template>
