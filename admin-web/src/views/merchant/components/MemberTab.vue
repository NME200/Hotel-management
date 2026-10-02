<script setup lang="ts">
import { computed, ref } from 'vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { Refresh, Search, User } from '@element-plus/icons-vue'

import { fetchMerchantMembers } from '@/api/merchant-insight'
import { QUERY_KEYS } from '@/api/keys'
import type { MemberLevel, MemberStatus, PlatformMember, PlatformMemberListParams } from '@/api/types/merchant-insight'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import { MEMBER_GENDER_DICT, MEMBER_LEVEL_DICT, MEMBER_LEVEL_OPTIONS, MEMBER_STATUS_DICT, MEMBER_STATUS_OPTIONS, dictLabel } from '@/constants/dictionary'
import { formatMoney } from '@/utils/format'
import PaginationBar from '@/components/common/PaginationBar.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import TimeText from '@/components/common/TimeText.vue'

const props = defineProps<{ merchantId: number }>()

const keyword = ref('')
const level = ref<MemberLevel | undefined>(undefined)
const status = ref<MemberStatus | undefined>(undefined)
const page = ref(DEFAULT_PAGE)
const pageSize = ref(DEFAULT_PAGE_SIZE)

const queryParams = computed<PlatformMemberListParams>(() => ({
  keyword: keyword.value.trim() || undefined,
  level: level.value,
  status: status.value,
  page: page.value,
  pageSize: pageSize.value,
}))

const memberQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.merchantInsight, props.merchantId, 'members', queryParams.value]),
  queryFn: () => fetchMerchantMembers(props.merchantId, queryParams.value),
  enabled: computed(() => props.merchantId > 0),
  placeholderData: keepPreviousData,
})

const rows = computed<PlatformMember[]>(() => memberQuery.data.value?.list ?? [])
const total = computed(() => memberQuery.data.value?.total ?? 0)

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
  <div class="member-tab">
    <div class="member-tab__toolbar">
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

    <el-table v-loading="memberQuery.isFetching.value" :data="rows" border stripe size="small">
      <el-table-column label="会员" min-width="180">
        <template #default="{ row }: { row: PlatformMember }">
          <div class="cell-member">
            <el-avatar :size="32" :src="row.avatar">
              <el-icon><User /></el-icon>
            </el-avatar>
            <div class="cell-text">
              <span class="text-ellipsis">{{ row.nickname || '未命名会员' }}</span>
              <p class="table-sub-text">{{ row.phone || '未绑定手机号' }}</p>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="等级" width="100" align="center">
        <template #default="{ row }: { row: PlatformMember }">
          <StatusTag :item="MEMBER_LEVEL_DICT[row.level]" />
        </template>
      </el-table-column>
      <el-table-column label="性别" width="80" align="center">
        <template #default="{ row }: { row: PlatformMember }">{{ dictLabel(MEMBER_GENDER_DICT, row.gender) }}</template>
      </el-table-column>
      <el-table-column label="积分" width="90" align="center">
        <template #default="{ row }: { row: PlatformMember }">{{ row.points }}</template>
      </el-table-column>
      <el-table-column label="余额" width="110" align="right">
        <template #default="{ row }: { row: PlatformMember }">{{ formatMoney(row.balance) }}</template>
      </el-table-column>
      <el-table-column label="累计消费" width="130" align="right">
        <template #default="{ row }: { row: PlatformMember }">
          <div class="cell-amount">
            <span>{{ formatMoney(row.totalAmount) }}</span>
            <p class="table-sub-text">{{ row.orderCount }} 单</p>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="最近下单" width="120">
        <template #default="{ row }: { row: PlatformMember }">
          <TimeText :value="row.lastOrderAt" mode="date" placeholder="暂无" />
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }: { row: PlatformMember }">
          <StatusTag :item="MEMBER_STATUS_DICT[row.status]" />
        </template>
      </el-table-column>
      <el-table-column label="备注" min-width="140">
        <template #default="{ row }: { row: PlatformMember }">
          <span v-if="row.remark" class="text-ellipsis">{{ row.remark }}</span>
          <span v-else class="text-muted">无</span>
        </template>
      </el-table-column>
      <el-table-column label="注册时间" width="130">
        <template #default="{ row }: { row: PlatformMember }"><TimeText :value="row.createdAt" mode="date" /></template>
      </el-table-column>
      <template #empty>
        <el-empty
          :description="memberQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '该商户暂无会员'"
          :image-size="60"
        />
      </template>
    </el-table>

    <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" />
  </div>
</template>

<style scoped>
.member-tab {
  display: flex;
  flex-direction: column;
}

.member-tab__toolbar {
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

.cell-member {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.cell-amount {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
</style>
