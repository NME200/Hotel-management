<script setup lang="ts">
import { computed, ref } from 'vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { Refresh, Search, User } from '@element-plus/icons-vue'

import { fetchMembers } from '@/api/member'
import { QUERY_KEYS } from '@/api/keys'
import type { Member, MemberLevel, MemberListParams, MemberStatus } from '@/api/types/member'
import { MEMBER_LEVEL_DICT, MEMBER_LEVEL_OPTIONS, MEMBER_STATUS_DICT, MEMBER_STATUS_OPTIONS } from '@/constants/dictionary'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import { PERMISSION } from '@/constants/permission'
import { formatDate, formatDateTime, formatMoney } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import PaginationBar from '@/components/common/PaginationBar.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import MemberDetailDrawer from './components/MemberDetailDrawer.vue'

const authStore = useAuthStore()

const keyword = ref('')
const level = ref<MemberLevel | undefined>(undefined)
const status = ref<MemberStatus | undefined>(undefined)
const page = ref(DEFAULT_PAGE)
const pageSize = ref(DEFAULT_PAGE_SIZE)

const drawerVisible = ref(false)
const activeMemberId = ref<number | null>(null)

const queryParams = computed<MemberListParams>(() => ({
  keyword: keyword.value.trim() || undefined,
  level: level.value,
  status: status.value,
  page: page.value,
  pageSize: pageSize.value,
}))

const memberQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.members, 'list', queryParams.value]),
  queryFn: () => fetchMembers(queryParams.value),
  enabled: computed(() => authStore.can(PERMISSION.memberRead)),
  placeholderData: keepPreviousData,
})

const rows = computed<Member[]>(() => memberQuery.data.value?.list ?? [])
const total = computed(() => memberQuery.data.value?.total ?? 0)

const levelItem = (row: Member) => MEMBER_LEVEL_DICT[row.level]
const statusItem = (row: Member) => MEMBER_STATUS_DICT[row.status]

function openDetail(row: Member): void {
  activeMemberId.value = row.id
  drawerVisible.value = true
}

function handleSearch(): void {
  page.value = DEFAULT_PAGE
}

function handleReset(): void {
  keyword.value = ''
  level.value = undefined
  status.value = undefined
  page.value = DEFAULT_PAGE
}
</script>

<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-toolbar">
        <el-space wrap :size="12">
          <el-input
            v-model="keyword"
            placeholder="昵称 / 手机号"
            clearable
            class="toolbar-input"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select v-model="level" placeholder="全部等级" clearable class="toolbar-select" @change="handleSearch">
            <el-option v-for="item in MEMBER_LEVEL_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-select v-model="status" placeholder="全部状态" clearable class="toolbar-select" @change="handleSearch">
            <el-option v-for="item in MEMBER_STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-space>
        <el-button @click="memberQuery.refetch()">
          <el-icon><Refresh /></el-icon>
          <span>刷新</span>
        </el-button>
      </div>

      <el-table v-loading="memberQuery.isFetching.value" :data="rows" border stripe class="member-table">
        <el-table-column label="会员" min-width="220">
          <template #default="{ row }: { row: Member }">
            <div class="cell-member">
              <el-avatar :size="38" :src="row.avatar">
                <el-icon><User /></el-icon>
              </el-avatar>
              <div class="cell-text">
                <span class="text-ellipsis">{{ row.nickname || '未命名会员' }}</span>
                <p class="table-sub-text">{{ row.phone || '未绑定手机号' }}</p>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="等级" width="110" align="center">
          <template #default="{ row }: { row: Member }">
            <StatusTag :item="levelItem(row)" />
          </template>
        </el-table-column>
        <el-table-column label="积分" width="90" align="center">
          <template #default="{ row }: { row: Member }">{{ row.points }}</template>
        </el-table-column>
        <el-table-column label="余额" width="120" align="right">
          <template #default="{ row }: { row: Member }">{{ formatMoney(row.balance) }}</template>
        </el-table-column>
        <el-table-column label="累计消费" width="130" align="right">
          <template #default="{ row }: { row: Member }">
            <div class="cell-amount">
              <span>{{ formatMoney(row.totalAmount) }}</span>
              <p class="table-sub-text">{{ row.orderCount }} 单</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="最近下单" width="130">
          <template #default="{ row }: { row: Member }">
            <span v-if="row.lastOrderAt">{{ formatDate(row.lastOrderAt) }}</span>
            <span v-else class="text-muted">暂无</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }: { row: Member }">
            <StatusTag :item="statusItem(row)" />
          </template>
        </el-table-column>
        <el-table-column label="注册时间" width="170">
          <template #default="{ row }: { row: Member }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right" align="right">
          <template #default="{ row }: { row: Member }">
            <el-button text type="primary" @click="openDetail(row)">
              <span>{{ authStore.can(PERMISSION.memberUpdate) ? '详情/编辑' : '详情' }}</span>
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty
            :description="memberQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '暂无会员'"
            :image-size="80"
          />
        </template>
      </el-table>

      <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" />
    </div>

    <MemberDetailDrawer v-model="drawerVisible" :member-id="activeMemberId" />
  </div>
</template>

<style scoped>
.toolbar-input {
  width: 200px;
}

.toolbar-select {
  width: 140px;
}

.member-table {
  padding: 0 16px;
}

.cell-member {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.cell-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.cell-amount {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
</style>
