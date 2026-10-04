<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="tip-page">
    <el-result icon="warning" title="无访问权限" sub-title="当前账号没有该功能的权限，请联系店长调整角色">
      <template #extra>
        <el-button type="primary" @click="router.replace('/cashier')">回到收银台</el-button>
      </template>
    </el-result>
  </div>
</template>

<style scoped>
.tip-page {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 24px;
}
</style>
