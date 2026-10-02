<script setup lang="ts">
import { computed, ref } from 'vue'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Key, Plus, Refresh, Search } from '@element-plus/icons-vue'

import { deleteStaff, fetchStaffs } from '@/api/staff'
import { QUERY_KEYS } from '@/api/keys'
import type { Staff, StaffListParams, StaffRole } from '@/api/types/staff'
import { STAFF_ROLE_DICT, STAFF_ROLE_OPTIONS, STAFF_STATUS_DICT } from '@/constants/dictionary'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import { PERMISSION } from '@/constants/permission'
import { formatDateTime } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import PaginationBar from '@/components/common/PaginationBar.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import StaffFormDialog from './components/StaffFormDialog.vue'
import ResetPasswordDialog from './components/ResetPasswordDialog.vue'

const authStore = useAuthStore()
const queryClient = useQueryClient()

const keyword = ref('')
const role = ref<StaffRole | undefined>(undefined)
const page = ref(DEFAULT_PAGE)
const pageSize = ref(DEFAULT_PAGE_SIZE)

const formVisible = ref(false)
const editingStaff = ref<Staff | null>(null)
const resetVisible = ref(false)
const resetTarget = ref<Staff | null>(null)

const queryParams = computed<StaffListParams>(() => ({
  keyword: keyword.value.trim() || undefined,
  role: role.value,
  page: page.value,
  pageSize: pageSize.value,
}))

const staffQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.staffs, 'list', queryParams.value]),
  queryFn: () => fetchStaffs(queryParams.value),
  enabled: computed(() => authStore.can(PERMISSION.staffRead)),
  placeholderData: keepPreviousData,
})

const rows = computed<Staff[]>(() => staffQuery.data.value?.list ?? [])
const total = computed(() => staffQuery.data.value?.total ?? 0)

const roleItem = (row: Staff) => STAFF_ROLE_DICT[row.role]
const statusItem = (row: Staff) => STAFF_STATUS_DICT[row.status]
const isSelf = (row: Staff) => row.id === authStore.user?.id

function openCreate(): void {
  editingStaff.value = null
  formVisible.value = true
}

function openEdit(row: Staff): void {
  editingStaff.value = row
  formVisible.value = true
}

function openReset(row: Staff): void {
  resetTarget.value = row
  resetVisible.value = true
}

async function handleDelete(row: Staff): Promise<void> {
  if (isSelf(row)) {
    ElMessage.warning('不能删除当前登录的账号')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认删除员工「${row.realName || row.username}」？删除后该账号将无法登录。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await deleteStaff(row.id)
    ElMessage.success('员工已删除')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.staffs })
  } catch {
    // 错误提示已由请求层统一处理
  }
}

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
          <el-select v-model="role" placeholder="全部角色" clearable class="toolbar-select" @change="handleSearch">
            <el-option v-for="item in STAFF_ROLE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-space>
        <el-space :size="8">
          <el-button @click="staffQuery.refetch()">
            <el-icon><Refresh /></el-icon>
            <span>刷新</span>
          </el-button>
          <el-button v-if="authStore.can(PERMISSION.staffCreate)" type="primary" @click="openCreate">
            <el-icon><Plus /></el-icon>
            <span>新增员工</span>
          </el-button>
        </el-space>
      </div>

      <el-table v-loading="staffQuery.isFetching.value" :data="rows" border stripe class="staff-table">
        <el-table-column label="员工" min-width="180">
          <template #default="{ row }: { row: Staff }">
            <div class="cell-staff">
              <div class="cell-text">
                <span class="text-ellipsis">
                  {{ row.realName || '未填写姓名' }}
                  <el-tag v-if="isSelf(row)" size="small" type="primary" effect="plain">本人</el-tag>
                </span>
                <p class="table-sub-text">{{ row.username }}</p>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="手机号" width="140">
          <template #default="{ row }: { row: Staff }">
            <span v-if="row.phone">{{ row.phone }}</span>
            <span v-else class="text-muted">未填写</span>
          </template>
        </el-table-column>
        <el-table-column label="角色" width="110" align="center">
          <template #default="{ row }: { row: Staff }">
            <StatusTag :item="roleItem(row)" />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }: { row: Staff }">
            <StatusTag :item="statusItem(row)" />
          </template>
        </el-table-column>
        <el-table-column label="最近登录" width="180">
          <template #default="{ row }: { row: Staff }">
            <span v-if="row.lastLoginAt">{{ formatDateTime(row.lastLoginAt) }}</span>
            <span v-else class="text-muted">从未登录</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }: { row: Staff }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right" align="right">
          <template #default="{ row }: { row: Staff }">
            <el-button v-if="authStore.can(PERMISSION.staffUpdate)" text type="primary" @click="openEdit(row)">
              <el-icon><Edit /></el-icon>
              <span>编辑</span>
            </el-button>
            <el-button v-if="authStore.can(PERMISSION.staffUpdate)" text type="warning" @click="openReset(row)">
              <el-icon><Key /></el-icon>
              <span>重置密码</span>
            </el-button>
            <el-button
              v-if="authStore.can(PERMISSION.staffDelete)"
              text
              type="danger"
              :disabled="isSelf(row)"
              @click="handleDelete(row)"
            >
              <el-icon><Delete /></el-icon>
              <span>删除</span>
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty
            :description="staffQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '暂无员工'"
            :image-size="80"
          />
        </template>
      </el-table>

      <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" />
    </div>

    <StaffFormDialog v-model="formVisible" :record="editingStaff" />
    <ResetPasswordDialog v-model="resetVisible" :staff="resetTarget" />
  </div>
</template>

<style scoped>
.toolbar-input {
  width: 200px;
}

.toolbar-select {
  width: 140px;
}

.staff-table {
  padding: 0 16px;
}

.cell-staff {
  display: flex;
  align-items: center;
  min-width: 0;
}

.cell-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
</style>
