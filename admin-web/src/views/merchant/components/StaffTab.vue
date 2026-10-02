<script setup lang="ts">
import { computed, ref } from 'vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { Refresh, Search } from '@element-plus/icons-vue'

import { fetchMerchantStaffs } from '@/api/merchant-insight'
import { QUERY_KEYS } from '@/api/keys'
import type { PlatformStaff, PlatformStaffListParams, StaffRole } from '@/api/types/merchant-insight'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import { STAFF_ROLE_DICT, STAFF_ROLE_OPTIONS, STAFF_STATUS_DICT } from '@/constants/dictionary'
import PaginationBar from '@/components/common/PaginationBar.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import TimeText from '@/components/common/TimeText.vue'

const props = defineProps<{ merchantId: number }>()

const keyword = ref('')
const role = ref<StaffRole | undefined>(undefined)
const page = ref(DEFAULT_PAGE)
const pageSize = ref(DEFAULT_PAGE_SIZE)

const queryParams = computed<PlatformStaffListParams>(() => ({
  keyword: keyword.value.trim() || undefined,
  role: role.value,
  page: page.value,
  pageSize: pageSize.value,
}))

const staffQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.merchantInsight, props.merchantId, 'staffs', queryParams.value]),
  queryFn: () => fetchMerchantStaffs(props.merchantId, queryParams.value),
  enabled: computed(() => props.merchantId > 0),
  placeholderData: keepPreviousData,
})

const rows = computed<PlatformStaff[]>(() => staffQuery.data.value?.list ?? [])
const total = computed(() => staffQuery.data.value?.total ?? 0)

function handleSearch(): void {
  page.value = DEFAULT_PAGE
}

function handleReset(): void {
  keyword.value = ''
  role.value = undefined
  page.value = DEFAULT_PAGE
}
</script>

<template>
  <div class="staff-tab">
    <div class="staff-tab__toolbar">
      <el-space wrap :size="12">
        <el-input
          v-model="keyword"
          placeholder="账号 / 姓名 / 手机号"
          clearable
          class="toolbar-input"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-select v-model="role" placeholder="全部角色" clearable class="toolbar-select" @change="handleSearch">
          <el-option v-for="item in STAFF_ROLE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button type="primary" @click="handleSearch">查询</el-button>
        <el-button @click="handleReset">重置</el-button>
      </el-space>
      <el-button @click="staffQuery.refetch()">
        <el-icon><Refresh /></el-icon>
        <span>刷新</span>
      </el-button>
    </div>

    <el-table v-loading="staffQuery.isFetching.value" :data="rows" border stripe size="small">
      <el-table-column label="员工" min-width="160">
        <template #default="{ row }: { row: PlatformStaff }">
          <div class="cell-text">
            <span class="text-ellipsis">{{ row.realName || '未填写姓名' }}</span>
            <p class="table-sub-text table-mono">{{ row.username }}</p>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="手机号" width="130">
        <template #default="{ row }: { row: PlatformStaff }">
          <span v-if="row.phone">{{ row.phone }}</span>
          <span v-else class="text-muted">未填写</span>
        </template>
      </el-table-column>
      <el-table-column label="角色" width="100" align="center">
        <template #default="{ row }: { row: PlatformStaff }">
          <StatusTag :item="STAFF_ROLE_DICT[row.role]" />
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }: { row: PlatformStaff }">
          <StatusTag :item="STAFF_STATUS_DICT[row.status]" />
        </template>
      </el-table-column>
      <el-table-column label="最近登录" width="170">
        <template #default="{ row }: { row: PlatformStaff }">
          <TimeText :value="row.lastLoginAt" placeholder="从未登录" />
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="130">
        <template #default="{ row }: { row: PlatformStaff }"><TimeText :value="row.createdAt" mode="date" /></template>
      </el-table-column>
      <template #empty>
        <el-empty
          :description="staffQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '该商户暂无员工'"
          :image-size="60"
        />
      </template>
    </el-table>

    <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" />
  </div>
</template>

<style scoped>
.staff-tab {
  display: flex;
  flex-direction: column;
}

.staff-tab__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.toolbar-input {
  width: 180px;
}

.toolbar-select {
  width: 120px;
}
</style>
