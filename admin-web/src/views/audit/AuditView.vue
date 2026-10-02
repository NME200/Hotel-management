<script setup lang="ts">
import { computed, ref } from 'vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { Refresh, Search } from '@element-plus/icons-vue'

import { fetchAuditActions, fetchAudits } from '@/api/audit'
import { QUERY_KEYS } from '@/api/keys'
import type { AuditItem, AuditListParams } from '@/api/types/audit'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import { DATE_PATTERN } from '@/constants/date-patterns'
import { PERMISSION } from '@/constants/permission'
import { dateRangeToFromTo, formatJson } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import PaginationBar from '@/components/common/PaginationBar.vue'
import TimeText from '@/components/common/TimeText.vue'

const authStore = useAuthStore()

const keyword = ref('')
const action = ref<string | undefined>(undefined)
const dateRange = ref<[string, string] | null>(null)
const page = ref(DEFAULT_PAGE)
const pageSize = ref(DEFAULT_PAGE_SIZE)

const timeRange = computed(() => dateRangeToFromTo(dateRange.value))

const queryParams = computed<AuditListParams>(() => ({
  keyword: keyword.value.trim() || undefined,
  action: action.value,
  from: timeRange.value.from,
  to: timeRange.value.to,
  page: page.value,
  pageSize: pageSize.value,
}))

const auditQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.audits, 'list', queryParams.value]),
  queryFn: () => fetchAudits(queryParams.value),
  enabled: computed(() => authStore.can(PERMISSION.auditRead)),
  placeholderData: keepPreviousData,
})

/** 操作类型下拉：由后端 /platform/audits/actions 下发，避免前端硬编码机器码 */
const actionsQuery = useQuery({
  queryKey: [...QUERY_KEYS.audits, 'actions'],
  queryFn: () => fetchAuditActions(),
  enabled: computed(() => authStore.can(PERMISSION.auditRead)),
  staleTime: 5 * 60 * 1000,
})

const rows = computed<AuditItem[]>(() => auditQuery.data.value?.list ?? [])
const total = computed(() => auditQuery.data.value?.total ?? 0)
const actionOptions = computed(() => actionsQuery.data.value ?? [])

function targetText(row: AuditItem): string {
  if (!row.targetType && !row.targetName) return '—'
  const name = row.targetName || (row.targetId !== null ? `#${row.targetId}` : '')
  return `${row.targetType ?? ''} ${name}`.trim()
}

function handleSearch(): void {
  page.value = DEFAULT_PAGE
}

function handleReset(): void {
  keyword.value = ''
  action.value = undefined
  dateRange.value = null
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
            placeholder="操作人 / 对象名称"
            clearable
            class="toolbar-input"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select
            v-model="action"
            placeholder="全部操作类型"
            clearable
            filterable
            class="toolbar-select"
            :loading="actionsQuery.isFetching.value"
            @change="handleSearch"
          >
            <el-option v-for="item in actionOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            unlink-panels
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            :value-format="DATE_PATTERN"
            class="toolbar-date"
            @change="handleSearch"
          />
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-space>
        <el-button @click="auditQuery.refetch()">
          <el-icon><Refresh /></el-icon>
          <span>刷新</span>
        </el-button>
      </div>

      <el-table v-loading="auditQuery.isFetching.value" :data="rows" border stripe class="audit-table">
        <el-table-column type="expand">
          <template #default="{ row }: { row: AuditItem }">
            <div class="audit-expand">
              <div class="audit-expand__block">
                <h4 class="audit-expand__title">变更详情</h4>
                <pre class="audit-expand__json">{{ formatJson(row.detail) }}</pre>
              </div>
              <div class="audit-expand__block">
                <h4 class="audit-expand__title">请求信息</h4>
                <el-descriptions :column="1" border size="small">
                  <el-descriptions-item label="操作人 ID">
                    {{ row.operatorId ?? '系统' }}
                  </el-descriptions-item>
                  <el-descriptions-item label="IP 地址">{{ row.ip || '未记录' }}</el-descriptions-item>
                  <el-descriptions-item label="User-Agent">
                    <span class="audit-expand__ua">{{ row.userAgent || '未记录' }}</span>
                  </el-descriptions-item>
                  <el-descriptions-item label="操作编码">{{ row.action }}</el-descriptions-item>
                </el-descriptions>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="180">
          <template #default="{ row }: { row: AuditItem }"><TimeText :value="row.createdAt" /></template>
        </el-table-column>
        <el-table-column label="操作人" min-width="140">
          <template #default="{ row }: { row: AuditItem }">
            <div class="cell-text">
              <span class="text-ellipsis">{{ row.operatorName || '系统' }}</span>
              <p v-if="row.operatorId !== null" class="table-sub-text">ID {{ row.operatorId }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="160">
          <template #default="{ row }: { row: AuditItem }">
            <div class="cell-text">
              <span class="text-ellipsis">{{ row.actionLabel }}</span>
              <p class="table-sub-text table-mono">{{ row.action }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作对象" min-width="180">
          <template #default="{ row }: { row: AuditItem }">{{ targetText(row) }}</template>
        </el-table-column>
        <el-table-column label="IP" width="140">
          <template #default="{ row }: { row: AuditItem }">
            <span v-if="row.ip" class="table-mono">{{ row.ip }}</span>
            <span v-else class="text-muted">未记录</span>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty
            :description="auditQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '暂无操作记录'"
            :image-size="80"
          />
        </template>
      </el-table>

      <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" />
    </div>
  </div>
</template>

<style scoped>
.toolbar-input {
  width: 200px;
}

.toolbar-select {
  width: 160px;
}

.toolbar-date {
  width: 260px;
}

.audit-table {
  padding: 0 16px;
}

.audit-expand {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 12px 24px;
  background: #f8fafd;
}

.audit-expand__block {
  flex: 1;
  min-width: 300px;
}

.audit-expand__title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
}

.audit-expand__json {
  max-height: 240px;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #1f2937;
  background: #fff;
  border: 1px solid #eef1f6;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-all;
}

.audit-expand__ua {
  display: inline-block;
  max-width: 460px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  vertical-align: bottom;
}
</style>
