<script setup lang="ts">
import { computed, ref } from 'vue'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Plus, Refresh, Search } from '@element-plus/icons-vue'

import { deleteActivity, fetchActivities, updateActivityStatus } from '@/api/activity'
import { QUERY_KEYS } from '@/api/keys'
import type { Activity, ActivityListParams, ActivitySlot, ActivityStatus } from '@/api/types/activity'
import {
  ACTIVITY_ACTION_DICT,
  ACTIVITY_SLOT_DICT,
  ACTIVITY_SLOT_OPTIONS,
  ACTIVITY_STATUS_OPTIONS,
  activityPhase,
  activityVisible,
} from '@/constants/dictionary'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import { PERMISSION } from '@/constants/permission'
import { formatDateTime } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import PaginationBar from '@/components/common/PaginationBar.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import ActivityFormDialog from './components/ActivityFormDialog.vue'

const authStore = useAuthStore()
const queryClient = useQueryClient()

const keyword = ref('')
const slot = ref<ActivitySlot | ''>('')
const status = ref<ActivityStatus | ''>('')
const page = ref(DEFAULT_PAGE)
const pageSize = ref(DEFAULT_PAGE_SIZE)
const dialogVisible = ref(false)
const editingActivity = ref<Activity | null>(null)

const queryParams = computed<ActivityListParams>(() => ({
  keyword: keyword.value.trim() || undefined,
  slot: slot.value || undefined,
  status: status.value || undefined,
  page: page.value,
  pageSize: pageSize.value,
}))

const activityQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.activities, 'list', queryParams.value]),
  queryFn: () => fetchActivities(queryParams.value),
  enabled: computed(() => authStore.can(PERMISSION.activityRead)),
  placeholderData: keepPreviousData,
})

const rows = computed<Activity[]>(() => activityQuery.data.value?.list ?? [])
const total = computed(() => activityQuery.data.value?.total ?? 0)

const toggleMutation = useMutation({
  mutationFn: (variables: { id: number; status: ActivityStatus }) =>
    updateActivityStatus(variables.id, variables.status),
  onSuccess: () => {
    ElMessage.success('展示状态已更新')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.activities })
  },
})

/** 生效期一栏要能看出「还没到」和「已经过」，商户才不会以为配错了位置 */
function periodText(row: Activity): string {
  if (!row.startsAt && !row.endsAt) return '长期有效'
  const from = row.startsAt ? formatDateTime(row.startsAt) : '立即'
  const to = row.endsAt ? formatDateTime(row.endsAt) : '不限'
  return `${from} ~ ${to}`
}

function handleSearch(): void {
  page.value = DEFAULT_PAGE
}

function handleReset(): void {
  keyword.value = ''
  slot.value = ''
  status.value = ''
  page.value = DEFAULT_PAGE
}

function openCreate(): void {
  editingActivity.value = null
  dialogVisible.value = true
}

function openEdit(row: Activity): void {
  editingActivity.value = row
  dialogVisible.value = true
}

function handleToggle(row: Activity, value: boolean): void {
  if (!authStore.can(PERMISSION.activityUpdate)) {
    ElMessage.warning('没有活动启停权限')
    return
  }
  toggleMutation.mutate({ id: row.id, status: value ? 'enabled' : 'disabled' })
}

async function handleDelete(row: Activity): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确认删除活动「${row.name}」？删除后小程序对应位置立即不再显示。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await deleteActivity(row.id)
    ElMessage.success('活动已删除')
    if (rows.value.length === 1 && page.value > DEFAULT_PAGE) page.value -= 1
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.activities })
  } catch {
    // 错误提示已由请求层统一处理
  }
}
</script>

<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-toolbar">
        <el-space wrap :size="12">
          <el-input
            v-model="keyword"
            placeholder="搜索活动名称或标题"
            clearable
            class="toolbar-input"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select v-model="slot" placeholder="展示位" clearable class="toolbar-select" @change="handleSearch">
            <el-option
              v-for="item in ACTIVITY_SLOT_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <el-select v-model="status" placeholder="状态" clearable class="toolbar-select" @change="handleSearch">
            <el-option
              v-for="item in ACTIVITY_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-space>
        <el-space :size="8">
          <el-button @click="activityQuery.refetch()">
            <el-icon><Refresh /></el-icon>
            <span>刷新</span>
          </el-button>
          <el-button v-if="authStore.can(PERMISSION.activityCreate)" type="primary" @click="openCreate">
            <el-icon><Plus /></el-icon>
            <span>新增活动</span>
          </el-button>
        </el-space>
      </div>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        class="activity-tip"
        title="这里的文案就是小程序上看到的内容：首页 Banner 可配多条并带轮播，「我的」页只取该位置排序最前的一张（没配则显示系统生成的会员日卡），会员中心活动区按排序列出全部。"
      />

      <el-table v-loading="activityQuery.isFetching.value" :data="rows" border stripe class="activity-table">
        <el-table-column prop="sort" label="排序" width="72" align="center" />
        <el-table-column label="活动" min-width="180">
          <template #default="{ row }: { row: Activity }">
            <div class="cell-text">
              <span class="text-ellipsis">{{ row.name }}</span>
              <p class="table-sub-text">ID：{{ row.id }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="展示位" width="130" align="center">
          <template #default="{ row }: { row: Activity }">
            <StatusTag :item="ACTIVITY_SLOT_DICT[row.slot]" />
          </template>
        </el-table-column>
        <el-table-column label="顾客端文案" min-width="260">
          <template #default="{ row }: { row: Activity }">
            <div class="cell-text">
              <span class="text-ellipsis">{{ row.title }}</span>
              <p class="table-sub-text text-ellipsis">{{ row.subTitle || '（无副标题）' }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="点击跳转" width="110" align="center">
          <template #default="{ row }: { row: Activity }">{{ ACTIVITY_ACTION_DICT[row.action].label }}</template>
        </el-table-column>
        <el-table-column label="生效期" width="230">
          <template #default="{ row }: { row: Activity }">{{ periodText(row) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="150" align="center">
          <template #default="{ row }: { row: Activity }">
            <div class="cell-status">
              <StatusTag :item="activityPhase(row)" />
              <el-switch
                :model-value="activityVisible(row)"
                size="small"
                :disabled="!authStore.can(PERMISSION.activityUpdate) || toggleMutation.isPending.value"
                @update:model-value="(value: boolean) => handleToggle(row, value)"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right" align="right">
          <template #default="{ row }: { row: Activity }">
            <el-button v-if="authStore.can(PERMISSION.activityUpdate)" text type="primary" @click="openEdit(row)">
              <el-icon><Edit /></el-icon>
              <span>编辑</span>
            </el-button>
            <el-button v-if="authStore.can(PERMISSION.activityDelete)" text type="danger" @click="handleDelete(row)">
              <el-icon><Delete /></el-icon>
              <span>删除</span>
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty
            :description="activityQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '暂无活动，新增一条即可让小程序显示运营位'"
            :image-size="80"
          />
        </template>
      </el-table>

      <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" />
    </div>

    <ActivityFormDialog v-model="dialogVisible" :record="editingActivity" />
  </div>
</template>

<style scoped>
.toolbar-input {
  width: 220px;
}

.toolbar-select {
  width: 150px;
}

.activity-tip {
  margin: 0 16px 12px;
}

.activity-table {
  padding: 0 16px;
}

.cell-status {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
}

.cell-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
</style>
