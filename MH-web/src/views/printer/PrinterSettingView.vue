<script setup lang="ts">
import { computed, ref } from 'vue'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CirclePlus, Delete, Edit, Refresh, Search } from '@element-plus/icons-vue'

import {
  fetchPrinters,
  fetchPrintTasks,
  removePrinter,
  updatePrinterStatus,
} from '@/api/print'
import { QUERY_KEYS } from '@/api/keys'
import type { PrinterItem, PrintTaskItem, PrintTaskQuery, PrintTaskStatus, PrintTicketType } from '@/api/types/print'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import { DATE_PATTERN } from '@/constants/date-patterns'
import {
  PRINT_MODE_DICT,
  PRINT_PROVIDER_LABEL,
  PRINT_TASK_STATUS_DICT,
  PRINT_TASK_STATUS_OPTIONS,
  PRINT_TICKET_TYPE_DICT,
  PRINT_TICKET_TYPE_OPTIONS,
  PRINT_TRIGGER_LABEL,
} from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { dateRangeToFromTo, formatDateTime } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import PaginationBar from '@/components/common/PaginationBar.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import PrinterFormDialog from './components/PrinterFormDialog.vue'

const authStore = useAuthStore()
const queryClient = useQueryClient()

const activeTab = ref<'printers' | 'tasks'>('printers')

const canManage = computed(() => authStore.can(PERMISSION.printerManage))

/* ------------------------------ 打印机列表 ------------------------------ */

const printerQuery = useQuery({
  queryKey: QUERY_KEYS.printers,
  queryFn: () => fetchPrinters(),
  enabled: computed(() => authStore.can(PERMISSION.printRead)),
})

const printers = computed<PrinterItem[]>(() => printerQuery.data.value ?? [])

const dialogVisible = ref(false)
const editingPrinter = ref<PrinterItem | null>(null)

function openCreate(): void {
  editingPrinter.value = null
  dialogVisible.value = true
}

function openEdit(record: PrinterItem): void {
  editingPrinter.value = record
  dialogVisible.value = true
}

const statusMutation = useMutation({
  mutationFn: (variables: { id: number; status: 'active' | 'disabled' }) =>
    updatePrinterStatus(variables.id, variables.status),
  onSuccess: () => {
    ElMessage.success('打印机状态已更新')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.printers })
  },
})

const removeMutation = useMutation({
  mutationFn: (id: number) => removePrinter(id),
  onSuccess: () => {
    ElMessage.success('打印机已删除')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.printers })
  },
})

async function confirmRemove(record: PrinterItem): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确认删除打印机「${record.name}」？删除后该票种将无法自动打票。`,
      '删除打印机',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  removeMutation.mutate(record.id)
}

/* ------------------------------ 打印流水 ------------------------------ */

const taskStatus = ref<PrintTaskStatus | undefined>(undefined)
const taskTicketType = ref<PrintTicketType | undefined>(undefined)
const taskOrderNo = ref('')
const taskDateRange = ref<[string, string] | null>(null)
const page = ref(DEFAULT_PAGE)
const pageSize = ref(DEFAULT_PAGE_SIZE)

const taskTimeRange = computed(() => dateRangeToFromTo(taskDateRange.value))

const taskParams = computed<PrintTaskQuery>(() => ({
  status: taskStatus.value,
  ticketType: taskTicketType.value,
  orderNo: taskOrderNo.value.trim() || undefined,
  from: taskTimeRange.value.from,
  to: taskTimeRange.value.to,
  page: page.value,
  pageSize: pageSize.value,
}))

const taskQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.printTasks, 'list', taskParams.value]),
  queryFn: () => fetchPrintTasks(taskParams.value),
  enabled: computed(
    () => activeTab.value === 'tasks' && authStore.can(PERMISSION.printRead),
  ),
  placeholderData: keepPreviousData,
})

const tasks = computed(() => taskQuery.data.value?.list ?? [])
const taskTotal = computed(() => taskQuery.data.value?.total ?? 0)

function handleTaskSearch(): void {
  page.value = DEFAULT_PAGE
}

function handleTaskReset(): void {
  taskStatus.value = undefined
  taskTicketType.value = undefined
  taskOrderNo.value = ''
  taskDateRange.value = null
  page.value = DEFAULT_PAGE
}
</script>

<template>
  <div class="page-container">
    <el-card class="page-card" shadow="never">
      <template #header>
        <div class="panel__header">
          <span>打印设置</span>
          <el-space>
            <el-button
              v-if="canManage"
              type="primary"
              @click="openCreate"
            >
              <el-icon><CirclePlus /></el-icon>
              <span>新增打印机</span>
            </el-button>
            <el-button @click="printerQuery.refetch()">
              <el-icon><Refresh /></el-icon>
              <span>刷新</span>
            </el-button>
          </el-space>
        </div>
      </template>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="打印机" name="printers">
          <el-alert
            v-if="!canManage"
            class="tab-tip"
            type="info"
            :closable="false"
            show-icon
            title="当前账号只有查看权限，修改打印机需要 printer:manage 权限"
          />

          <el-table v-loading="printerQuery.isFetching.value" :data="printers" border stripe>
            <el-table-column label="名称" min-width="150">
              <template #default="{ row }: { row: PrinterItem }">
                <span class="cell-name">{{ row.name }}</span>
                <p v-if="row.remark" class="table-sub-text">{{ row.remark }}</p>
              </template>
            </el-table-column>
            <el-table-column label="票种" width="120" align="center">
              <template #default="{ row }: { row: PrinterItem }">
                <StatusTag :item="PRINT_TICKET_TYPE_DICT[row.ticketType]" />
              </template>
            </el-table-column>
            <el-table-column label="打印方式" width="130" align="center">
              <template #default="{ row }: { row: PrinterItem }">
                <StatusTag :item="PRINT_MODE_DICT[row.mode]" />
              </template>
            </el-table-column>
            <el-table-column label="设备" min-width="170">
              <template #default="{ row }: { row: PrinterItem }">
                <template v-if="row.mode === 'cloud'">
                  <span>{{ row.provider ? PRINT_PROVIDER_LABEL[row.provider] : '--' }}</span>
                  <p class="table-sub-text">sn：{{ row.deviceNo || '--' }}</p>
                </template>
                <span v-else class="text-muted">本机打印机</span>
              </template>
            </el-table-column>
            <el-table-column label="纸张 / 份数" width="130" align="center">
              <template #default="{ row }: { row: PrinterItem }">
                <span>{{ row.paperSize }}</span>
                <p class="table-sub-text">默认 {{ row.copies }} 份</p>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }: { row: PrinterItem }">
                <el-switch
                  :model-value="row.status === 'active'"
                  :disabled="!canManage"
                  inline-prompt
                  active-text="启用"
                  inactive-text="停用"
                  @change="(value: string | number | boolean) => statusMutation.mutate({ id: row.id, status: value ? 'active' : 'disabled' })"
                />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right" align="right">
              <template #default="{ row }: { row: PrinterItem }">
                <el-button text type="primary" :disabled="!canManage" @click="openEdit(row)">
                  <el-icon><Edit /></el-icon>
                  <span>编辑</span>
                </el-button>
                <el-button text type="danger" :disabled="!canManage" @click="confirmRemove(row)">
                  <el-icon><Delete /></el-icon>
                  <span>删除</span>
                </el-button>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty
                :description="printerQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '还没有配置打印机'"
                :image-size="80"
              />
            </template>
          </el-table>

          <p v-if="printers.length === 0 && !printerQuery.isFetching.value" class="tab-tip text-muted">
            提示：只配「浏览器小票机」也能打印 —— 点订单列表的打印按钮即可出纸，无需任何额外配置。
            买了云打印机（飞鹅 / 易联云）则选「云打印机」并填机身设备号（sn）即可，厂商密钥由平台配置。
          </p>
        </el-tab-pane>

        <el-tab-pane label="打印流水" name="tasks">
          <div class="page-toolbar">
            <el-space wrap :size="12">
              <el-input
                v-model="taskOrderNo"
                placeholder="订单号"
                clearable
                class="toolbar-input"
                @keyup.enter="handleTaskSearch"
                @clear="handleTaskSearch"
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
              </el-input>
              <el-select
                v-model="taskStatus"
                placeholder="全部状态"
                clearable
                class="toolbar-select"
                @change="handleTaskSearch"
              >
                <el-option
                  v-for="item in PRINT_TASK_STATUS_OPTIONS"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
              <el-select
                v-model="taskTicketType"
                placeholder="全部票种"
                clearable
                class="toolbar-select"
                @change="handleTaskSearch"
              >
                <el-option
                  v-for="item in PRINT_TICKET_TYPE_OPTIONS"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
              <el-date-picker
                v-model="taskDateRange"
                type="daterange"
                unlink-panels
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                :value-format="DATE_PATTERN"
                class="toolbar-date"
                @change="handleTaskSearch"
              />
              <el-button type="primary" @click="handleTaskSearch">查询</el-button>
              <el-button @click="handleTaskReset">重置</el-button>
            </el-space>
          </div>

          <el-table v-loading="taskQuery.isFetching.value" :data="tasks" border stripe>
            <el-table-column label="订单号" min-width="170">
              <template #default="{ row }: { row: PrintTaskItem }">
                <span class="cell-no">{{ row.orderNo }}</span>
                <p class="table-sub-text">{{ formatDateTime(row.createdAt) }}</p>
              </template>
            </el-table-column>
            <el-table-column label="票种" width="110" align="center">
              <template #default="{ row }: { row: PrintTaskItem }">
                <StatusTag :item="PRINT_TICKET_TYPE_DICT[row.ticketType]" />
              </template>
            </el-table-column>
            <el-table-column label="打印机" min-width="130">
              <template #default="{ row }: { row: PrintTaskItem }">
                <span v-if="row.printerName">{{ row.printerName }}</span>
                <span v-else class="text-muted">未配置</span>
              </template>
            </el-table-column>
            <el-table-column label="份数" width="80" align="center">
              <template #default="{ row }: { row: PrintTaskItem }">×{{ row.copies }}</template>
            </el-table-column>
            <el-table-column label="状态" width="130" align="center">
              <template #default="{ row }: { row: PrintTaskItem }">
                <StatusTag :item="PRINT_TASK_STATUS_DICT[row.status]" />
                <p v-if="row.retryCount > 0" class="table-sub-text">已重试 {{ row.retryCount }} 次</p>
              </template>
            </el-table-column>
            <el-table-column label="触发 / 操作人" min-width="140">
              <template #default="{ row }: { row: PrintTaskItem }">
                <span>{{ PRINT_TRIGGER_LABEL[row.trigger ?? 'manual'] ?? row.trigger }}</span>
                <p v-if="row.operatorName" class="table-sub-text">{{ row.operatorName }}</p>
              </template>
            </el-table-column>
            <el-table-column label="失败原因" min-width="180">
              <template #default="{ row }: { row: PrintTaskItem }">
                <span v-if="row.failReason" class="cell-fail">{{ row.failReason }}</span>
                <span v-else class="text-muted">--</span>
              </template>
            </el-table-column>
            <el-table-column label="打印时间" width="170">
              <template #default="{ row }: { row: PrintTaskItem }">{{ formatDateTime(row.printedAt) }}</template>
            </el-table-column>
            <template #empty>
              <el-empty
                :description="taskQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '暂无打印记录'"
                :image-size="80"
              />
            </template>
          </el-table>

          <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="taskTotal" />
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <PrinterFormDialog v-model="dialogVisible" :record="editingPrinter" />
  </div>
</template>

<style scoped>
.panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 15px;
  font-weight: 600;
}

.tab-tip {
  margin-bottom: 12px;
  font-size: 13px;
}

.page-toolbar {
  margin-bottom: 12px;
}

.toolbar-input {
  width: 180px;
}

.toolbar-select {
  width: 140px;
}

.toolbar-date {
  width: 260px;
}

.cell-name {
  font-weight: 500;
}

.cell-no {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-weight: 500;
}

.cell-fail {
  color: #f56c6c;
}
</style>
