<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="tip-page">
    <el-result icon="info" title="页面不存在" sub-title="地址可能已经变了，回到收银台继续">
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
