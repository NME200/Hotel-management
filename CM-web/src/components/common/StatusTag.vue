<script setup lang="ts">
import { computed } from 'vue'

import type { DictOption, TagType } from '@/constants/dictionary'

/** 表格里的状态列统一用它，字典项直接取自 constants/dictionary */
const props = defineProps<{
  item?: DictOption | null
  size?: 'large' | 'default' | 'small'
}>()

const tagType = computed<TagType>(() => props.item?.tag ?? 'info')
const label = computed<string>(() => props.item?.label ?? '--')
</script>

<template>
  <el-tag :type="tagType" :size="size ?? 'small'" effect="light" disable-transitions>
    {{ label }}
  </el-tag>
</template>
