<script setup lang="ts">
import { useRouter } from 'vue-router'

import { ROUTE_PATHS } from '@/router/meta'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

function goHome(): void {
  void router.replace(ROUTE_PATHS.home)
}
</script>

<template>
  <el-result icon="warning" title="403" sub-title="当前账号没有访问该页面的权限，请联系商家管理员分配">
    <template #extra>
      <el-space>
        <el-button @click="router.back()">返回上一页</el-button>
        <el-button v-if="authStore.isAuthenticated" type="primary" @click="goHome">回到首页</el-button>
        <el-button v-else type="primary" @click="router.replace(ROUTE_PATHS.login)">去登录</el-button>
      </el-space>
    </template>
  </el-result>
</template>
