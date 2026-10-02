<script setup lang="ts">
import { PAGE_SIZE_OPTIONS } from '@/constants/api'

defineProps<{ total: number }>()

const page = defineModel<number>('page', { required: true })
const pageSize = defineModel<number>('pageSize', { required: true })
</script>

<template>
  <div class="page-pagination">
    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      background
      :total="total"
      :page-sizes="PAGE_SIZE_OPTIONS"
      :pager-count="5"
      layout="total, sizes, prev, pager, next, jumper"
    />
  </div>
</template>
