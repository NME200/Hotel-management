<script setup lang="ts">
import { computed, ref } from 'vue'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, CircleClose, Edit, Key, Plus, Refresh, Search } from '@element-plus/icons-vue'

import { fetchAccounts, updateAccount } from '@/api/account'
import { QUERY_KEYS } from '@/api/keys'
import type { AccountStatus, PlatformAccount } from '@/api/types/account'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import { ACCOUNT_STATUS_DICT, PLATFORM_ROLE_DICT, dictLabel } from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { useAuthStore } from '@/stores/auth'
import PaginationBar from '@/components/common/PaginationBar.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import TimeText from '@/components/common/TimeText.vue'
import AccountFormDialog from './components/AccountFormDialog.vue'
import ResetPasswordDialog from './components/ResetPasswordDialog.vue'

const authStore = useAuthStore()
const queryClient = useQueryClient()

const keyword = ref('')
const page = ref(DEFAULT_PAGE)
const pageSize = ref(DEFAULT_PAGE_SIZE)

const formVisible = ref(false)
const editingAccount = ref<PlatformAccount | null>(null)
const resetVisible = ref(false)
const resetTarget = ref<PlatformAccount | null>(null)

const queryParams = computed(() => ({
  keyword: keyword.value.trim() || undefined,
  page: page.value,
  pageSize: pageSize.value,
}))

const accountQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.accounts, 'list', queryParams.value]),
  queryFn: () => fetchAccounts(queryParams.value),
  enabled: computed(() => authStore.can(PERMISSION.accountManage)),
  placeholderData: keepPreviousData,
})

const rows = computed<PlatformAccount[]>(() => accountQuery.data.value?.list ?? [])
const total = computed(() => accountQuery.data.value?.total ?? 0)

const isSelf = (row: PlatformAccount) => row.id === authStore.user?.id

const statusMutation = useMutation({
  mutationFn: (variables: { id: number; status: AccountStatus }) => updateAccount(variables.id, { status: variables.status }),
  onSuccess: (_data, variables) => {
    ElMessage.success(`账号已${dictLabel(ACCOUNT_STATUS_DICT, variables.status)}`)
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.accounts })
  },
})

function openCreate(): void {
  editingAccount.value = null
  formVisible.value = true
}

function openEdit(row: PlatformAccount): void {
  editingAccount.value = row
  formVisible.value = true
}

function openReset(row: PlatformAccount): void {
  resetTarget.value = row
  resetVisible.value = true
}

async function toggleStatus(row: PlatformAccount): Promise<void> {
  const next: AccountStatus = row.status === 'active' ? 'disabled' : 'active'
  const action = next === 'disabled' ? '禁用' : '启用'
  if (isSelf(row) && next === 'disabled') {
    ElMessage.warning('不能禁用当前登录的账号')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认${action}账号「${row.realName || row.username}」？${next === 'disabled' ? '禁用后该账号将无法登录平台后台。' : ''}`,
      `${action}确认`,
      { type: 'warning', confirmButtonText: action, cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  statusMutation.mutate({ id: row.id, status: next })
}

function handleSearch(): void {
  page.value = DEFAULT_PAGE
}

function handleReset(): void {
  keyword.value = ''
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
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-space>
        <el-space :size="8">
          <el-button @click="accountQuery.refetch()">
            <el-icon><Refresh /></el-icon>
            <span>刷新</span>
          </el-button>
          <el-button v-if="authStore.can(PERMISSION.accountManage)" type="primary" @click="openCreate">
            <el-icon><Plus /></el-icon>
            <span>新增账号</span>
          </el-button>
        </el-space>
      </div>

      <el-table v-loading="accountQuery.isFetching.value" :data="rows" border stripe class="account-table">
        <el-table-column label="账号" min-width="200">
          <template #default="{ row }: { row: PlatformAccount }">
            <div class="cell-text">
              <span class="text-ellipsis">
                {{ row.realName || '未填写姓名' }}
                <el-tag v-if="isSelf(row)" size="small" type="primary" effect="plain">本人</el-tag>
              </span>
              <p class="table-sub-text table-mono">{{ row.username }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="手机号" width="140">
          <template #default="{ row }: { row: PlatformAccount }">
            <span v-if="row.phone">{{ row.phone }}</span>
            <span v-else class="text-muted">未填写</span>
          </template>
        </el-table-column>
        <el-table-column label="角色" width="130" align="center">
          <template #default="{ row }: { row: PlatformAccount }">
            <StatusTag :item="PLATFORM_ROLE_DICT[row.role]" />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }: { row: PlatformAccount }">
            <StatusTag :item="ACCOUNT_STATUS_DICT[row.status]" />
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }: { row: PlatformAccount }"><TimeText :value="row.createdAt" /></template>
        </el-table-column>
        <el-table-column label="更新时间" width="170">
          <template #default="{ row }: { row: PlatformAccount }"><TimeText :value="row.updatedAt" /></template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right" align="right">
          <template #default="{ row }: { row: PlatformAccount }">
            <el-button text type="primary" @click="openEdit(row)">
              <el-icon><Edit /></el-icon>
              <span>编辑</span>
            </el-button>
            <el-button text type="warning" @click="openReset(row)">
              <el-icon><Key /></el-icon>
              <span>重置密码</span>
            </el-button>
            <el-button
              v-if="row.status === 'active'"
              text
              type="danger"
              :disabled="isSelf(row) || statusMutation.isPending.value"
              @click="toggleStatus(row)"
            >
              <el-icon><CircleClose /></el-icon>
              <span>禁用</span>
            </el-button>
            <el-button
              v-else
              text
              type="success"
              :disabled="statusMutation.isPending.value"
              @click="toggleStatus(row)"
            >
              <el-icon><Check /></el-icon>
              <span>启用</span>
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty
            :description="accountQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '暂无平台账号'"
            :image-size="80"
          />
        </template>
      </el-table>

      <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" />
    </div>

    <AccountFormDialog v-model="formVisible" :record="editingAccount" />
    <ResetPasswordDialog v-model="resetVisible" :record="resetTarget" />
  </div>
</template>

<style scoped>
.toolbar-input {
  width: 220px;
}

.account-table {
  padding: 0 16px;
}
</style>
