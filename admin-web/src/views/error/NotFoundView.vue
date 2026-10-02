<script setup lang="ts">
import { useRouter } from 'vue-router'

import { ROUTE_PATHS } from '@/router/meta'

const router = useRouter()
</script>

<template>
  <el-result icon="info" title="404" sub-title="页面不存在或已被移除">
    <template #extra>
      <el-space>
        <el-button @click="router.back()">返回上一页</el-button>
        <el-button type="primary" @click="router.replace(ROUTE_PATHS.home)">回到首页</el-button>
      </el-space>
    </template>
  </el-result>
</template>
