<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { Refresh, View } from '@element-plus/icons-vue'

import { fetchExpiringMerchants } from '@/api/merchant'
import { QUERY_KEYS } from '@/api/keys'
import type { ExpiringMerchant } from '@/api/types/merchant'
import { DATE_PATTERN } from '@/constants/date-patterns'
import {
  EXPIRING_DAY_OPTIONS,
  MERCHANT_STATUS_DICT,
  expiringTagType,
  expiringText,
} from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { formatDateTime } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import StatusTag from '@/components/common/StatusTag.vue'
import MerchantDetailDrawer from '@/views/merchant/components/MerchantDetailDrawer.vue'

const authStore = useAuthStore()

const days = ref(30)

const drawerVisible = ref(false)
const detailMerchantId = ref<number | null>(null)

const expiringQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.expiring, days.value]),
  queryFn: () => fetchExpiringMerchants(days.value),
  enabled: computed(() => authStore.can(PERMISSION.merchantRead)),
})

const rows = computed<ExpiringMerchant[]>(() => expiringQuery.data.value ?? [])
const overdueCount = computed(() => rows.value.filter((item) => item.daysLeft < 0).length)

function openDetail(row: ExpiringMerchant): void {
  detailMerchantId.value = row.id
  drawerVisible.value = true
}
</script>

<template>
  <div class="page-container">
    <el-alert type="warning" :closable="false" show-icon class="expiring-alert">
      <template #title>
        共 {{ rows.length }} 家商户在 {{ days }} 天内到期，其中 {{ overdueCount }} 家已过期。到期后商户状态自动变为「已过期」，
        小程序端将无法点餐，请及时联系商户续约。
      </template>
    </el-alert>

    <div class="page-card">
      <div class="page-toolbar">
        <el-space wrap :size="12">
          <span class="expiring-label">统计窗口</span>
          <el-radio-group v-model="days">
            <el-radio-button v-for="item in EXPIRING_DAY_OPTIONS" :key="item" :value="item">
              {{ item }} 天内
            </el-radio-button>
          </el-radio-group>
        </el-space>
        <el-button @click="expiringQuery.refetch()">
          <el-icon><Refresh /></el-icon>
          <span>刷新</span>
        </el-button>
      </div>

      <el-table v-loading="expiringQuery.isFetching.value" :data="rows" border stripe class="expiring-table">
        <el-table-column label="商户" min-width="220">
          <template #default="{ row }: { row: ExpiringMerchant }">
            <div class="cell-text">
              <span class="text-ellipsis">{{ row.name }}</span>
              <p class="table-sub-text table-mono">{{ row.code }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="到期时间" width="180">
          <template #default="{ row }: { row: ExpiringMerchant }">
            {{ formatDateTime(row.expireAt, DATE_PATTERN) }}
          </template>
        </el-table-column>
        <el-table-column label="剩余天数" width="150" align="center">
          <template #default="{ row }: { row: ExpiringMerchant }">
            <el-tag :type="expiringTagType(row.daysLeft)" size="small" effect="light" disable-transitions>
              {{ expiringText(row.daysLeft) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="当前状态" width="120" align="center">
          <template #default="{ row }: { row: ExpiringMerchant }">
            <StatusTag :item="MERCHANT_STATUS_DICT[row.status]" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right" align="right">
          <template #default="{ row }: { row: ExpiringMerchant }">
            <el-button text type="primary" @click="openDetail(row)">
              <el-icon><View /></el-icon>
              <span>详情</span>
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty
            :description="expiringQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '该窗口内没有到期商户'"
            :image-size="80"
          />
        </template>
      </el-table>
    </div>

    <MerchantDetailDrawer v-model="drawerVisible" :merchant-id="detailMerchantId" />
  </div>
</template>

<style scoped>
.expiring-alert :deep(.el-alert__title) {
  line-height: 1.7;
}

.expiring-label {
  font-size: 13px;
  color: #606266;
}

.expiring-table {
  padding: 0 16px 16px;
}
</style>
