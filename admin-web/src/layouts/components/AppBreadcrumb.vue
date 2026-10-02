<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

interface Crumb {
  title: string
  path: string | null
}

const route = useRoute()

/** 面包屑取自路由 matched，只有配置了 meta.title 的层级才展示 */
const crumbs = computed<Crumb[]>(() =>
  route.matched
    .filter((record) => typeof record.meta.title === 'string' && record.meta.title.length > 0)
    .map((record, index, list) => ({
      title: record.meta.title as string,
      path: index === list.length - 1 ? null : record.path,
    })),
)
</script>

<template>
  <el-breadcrumb separator="/" class="breadcrumb">
    <el-breadcrumb-item v-for="item in crumbs" :key="item.title" :to="item.path ?? undefined">
      {{ item.title }}
    </el-breadcrumb-item>
  </el-breadcrumb>
</template>

<style scoped>
.breadcrumb {
  font-size: 14px;
  white-space: nowrap;
}
</style>
