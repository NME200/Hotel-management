<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CirclePlus, Delete, Download, Edit, Printer, Refresh, RefreshRight } from '@element-plus/icons-vue'

import {
  closeTable,
  createTablesBatch,
  fetchTables,
  openTable,
  regenerateTableQrCode,
  removeTable,
  updateTableStatus,
} from '@/api/table'
import { QUERY_KEYS } from '@/api/keys'
import type { TableBatchCreateInput, TableItem, TableStatus } from '@/api/types/table'
import { TABLE_BATCH_MAX } from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { useAuthStore } from '@/stores/auth'
import { diningDuration } from '@/utils/format'
import TableFormDialog from './components/TableFormDialog.vue'

const authStore = useAuthStore()
const queryClient = useQueryClient()

const canManage = computed(() => authStore.can(PERMISSION.tableManage))
/** 开台/清台是第三档权限：前台与服务员能翻台，但不该能改桌位或重制二维码 */
const canOperate = computed(() => authStore.can(PERMISSION.tableOperate))

const tableQuery = useQuery({
  queryKey: QUERY_KEYS.tables,
  queryFn: () => fetchTables(),
  enabled: computed(() => authStore.can(PERMISSION.tableRead)),
})

const tables = computed<TableItem[]>(() => tableQuery.data.value ?? [])

/** 二维码地址：本地存储是 /uploads 相对路径，对象存储是绝对地址，两种都能直接给 <img> */
function qrUrl(row: TableItem): string {
  return row.qrCodeUrl ?? ''
}

/* ------------------------------ 单个桌位 ------------------------------ */

const dialogVisible = ref(false)
const editingTable = ref<TableItem | null>(null)

function openCreate(): void {
  editingTable.value = null
  dialogVisible.value = true
}

function openEdit(record: TableItem): void {
  editingTable.value = record
  dialogVisible.value = true
}

const statusMutation = useMutation({
  mutationFn: (variables: { id: number; status: TableStatus }) =>
    updateTableStatus(variables.id, variables.status),
  onSuccess: () => {
    ElMessage.success('桌位状态已更新')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tables })
  },
})

const removeMutation = useMutation({
  mutationFn: (id: number) => removeTable(id),
  onSuccess: () => {
    ElMessage.success('桌位已删除')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tables })
  },
})

async function confirmRemove(record: TableItem): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确认删除桌位「${record.tableNo}」？该桌的二维码会同时失效，已贴在桌上的码需要回收。`,
      '删除桌位',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  removeMutation.mutate(record.id)
}

const regenerateMutation = useMutation({
  mutationFn: (id: number) => regenerateTableQrCode(id),
  onSuccess: () => {
    ElMessage.success('二维码已重新生成')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tables })
  },
})

async function confirmRegenerate(record: TableItem): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确认重新生成「${record.tableNo}」的二维码？旧码会立即失效，桌上那张需要撕掉换新。`,
      '重新生成二维码',
      { confirmButtonText: '确认重制', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  regenerateMutation.mutate(record.id)
}

/* ------------------------------ 开台 / 清台 ------------------------------ */

const idleCount = computed(() => tables.value.filter((row) => row.diningStatus === 'idle').length)
const diningCount = computed(() => tables.value.filter((row) => row.diningStatus === 'dining').length)

const openVisible = ref(false)
const openTarget = ref<TableItem | null>(null)
const openGuestCount = ref(2)

function askOpen(record: TableItem): void {
  openTarget.value = record
  openGuestCount.value = record.seats ?? 2
  openVisible.value = true
}

const openMutation = useMutation({
  mutationFn: (variables: { id: number; guestCount: number }) =>
    openTable(variables.id, { guestCount: variables.guestCount }),
  onSuccess: () => {
    ElMessage.success('已开台')
    openVisible.value = false
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tables })
  },
})

const closeMutation = useMutation({
  mutationFn: (variables: { id: number; force: boolean }) =>
    closeTable(variables.id, { force: variables.force }),
  onSuccess: () => {
    ElMessage.success('已清台')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tables })
  },
})

/**
 * 清台：桌上有未结账订单时后端会拒绝，这里再问一次「是否强制清台」。
 *
 * 强制清台必须是第二次明确确认，而不是失败后自动重试 —— 顾客跑单是真会发生，
 * 但只有收银员清楚自己跳过了未结账检查。
 */
async function askClose(record: TableItem): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认清台「${record.tableNo}」？`, '清台', {
      confirmButtonText: '清台',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  try {
    await closeMutation.mutateAsync({ id: record.id, force: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!message.includes('未结账')) return
    try {
      await ElMessageBox.confirm(`${message}。确认强制清台？`, '强制清台', {
        confirmButtonText: '强制清台',
        cancelButtonText: '取消',
        type: 'warning',
      })
    } catch {
      return
    }
    closeMutation.mutate({ id: record.id, force: true })
  }
}

/** 单张下载：浏览器直接存图；对象存储跨域时退化为打开新标签，用户可右键另存。 */
function downloadOne(record: TableItem): void {
  const url = qrUrl(record)
  if (!url) {
    ElMessage.warning('这张桌还没有二维码，请先点「重新生成」')
    return
  }
  const link = document.createElement('a')
  link.href = url
  link.download = `桌位-${record.tableNo}.png`
  link.target = '_blank'
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/* ------------------------------ 批量建桌 ------------------------------ */

const batchVisible = ref(false)
const batchSubmitting = ref(false)
const batchForm = reactive<TableBatchCreateInput>({
  prefix: 'A',
  startNo: 1,
  count: 10,
  padLength: 2,
  area: null,
  seats: null,
})

const batchPreview = computed<string>(() => {
  const prefix = batchForm.prefix ?? ''
  const pad = batchForm.padLength ?? 2
  const first = `${prefix}${String(batchForm.startNo).padStart(pad, '0')}`
  const last = `${prefix}${String(batchForm.startNo + batchForm.count - 1).padStart(pad, '0')}`
  return `${first} ~ ${last}`
})

function openBatch(): void {
  batchForm.prefix = 'A'
  batchForm.startNo = 1
  batchForm.count = 10
  batchForm.padLength = 2
  batchForm.area = null
  batchForm.seats = null
  batchVisible.value = true
}

async function submitBatch(): Promise<void> {
  if (batchForm.count < 1 || batchForm.count > TABLE_BATCH_MAX) {
    ElMessage.warning(`一次最多生成 ${TABLE_BATCH_MAX} 张桌位`)
    return
  }
  batchSubmitting.value = true
  try {
    const result = await createTablesBatch({
      prefix: (batchForm.prefix ?? '').trim() || undefined,
      startNo: batchForm.startNo,
      count: batchForm.count,
      padLength: batchForm.padLength ?? 2,
      area: batchForm.area?.toString().trim() || null,
      seats: batchForm.seats ?? null,
    })
    const skipped = result.skipped.length
    ElMessage.success(
      skipped > 0
        ? `已生成 ${result.created.length} 张桌位，${skipped} 个桌号已存在被跳过`
        : `已生成 ${result.created.length} 张桌位`,
    )
    batchVisible.value = false
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tables })
  } catch {
    // 错误提示由请求层统一弹出，这里只需要恢复按钮状态
  } finally {
    batchSubmitting.value = false
  }
}

/* ------------------------------ 批量打印 ------------------------------ */

/**
 * 批量打印：把二维码拼成一张打印页在新窗口里打开。
 *
 * 不引任何 PDF/打包库 —— 商家真正要的是「贴到桌上」，浏览器打印最省事：
 * 三列网格，每格一张码加桌号，A4 一页能放下十几张。
 */
function printAll(): void {
  const ready = tables.value.filter((row) => row.qrCodeUrl)
  if (!ready.length) {
    ElMessage.warning('还没有可打印的二维码，请先生成')
    return
  }

  const cells = ready
    .map(
      (row) => `
      <div class="cell">
        <img src="${row.qrCodeUrl}" alt="${escapeHtml(row.tableNo)}" />
        <p class="no">${escapeHtml(row.tableNo)}</p>
        <p class="hint">微信扫码点餐</p>
      </div>`,
    )
    .join('')

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>桌位二维码</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; font-family: system-ui, -apple-system, "Microsoft YaHei", sans-serif; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .cell { border: 1px dashed #bbb; border-radius: 8px; padding: 12px; text-align: center; break-inside: avoid; }
  .cell img { width: 100%; max-width: 220px; height: auto; }
  .no { margin: 6px 0 0; font-size: 20px; font-weight: 600; }
  .hint { margin: 2px 0 0; font-size: 12px; color: #666; }
  @media print { body { padding: 0; } .cell { border-color: #ddd; } }
</style>
</head>
<body><div class="grid">${cells}</div>
<script>window.addEventListener('load', function () { window.print(); });<\/script>
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) {
    ElMessage.warning('浏览器拦截了新窗口，请允许弹出窗口后重试')
    return
  }
  win.document.write(html)
  win.document.close()
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
</script>

<template>
  <div class="page-container">
    <el-card class="page-card" shadow="never">
      <template #header>
        <div class="panel__header">
          <span class="panel__title">桌位管理</span>
          <span v-if="tables.length" class="panel__stat">
            空闲 {{ idleCount }} · 用餐中 {{ diningCount }} · 共 {{ tables.length }} 桌
          </span>
          <el-space>
            <el-button v-if="canManage" type="primary" @click="openCreate">
              <el-icon><CirclePlus /></el-icon>
              <span>新增桌位</span>
            </el-button>
            <el-button v-if="canManage" @click="openBatch">
              <el-icon><CirclePlus /></el-icon>
              <span>批量建桌</span>
            </el-button>
            <el-button @click="printAll">
              <el-icon><Printer /></el-icon>
              <span>批量打印二维码</span>
            </el-button>
            <el-button @click="tableQuery.refetch()">
              <el-icon><Refresh /></el-icon>
              <span>刷新</span>
            </el-button>
          </el-space>
        </div>
      </template>

      <el-alert
        v-if="!canManage && !canOperate"
        class="tab-tip"
        type="info"
        :closable="false"
        show-icon
        title="当前账号只能查看桌位与二维码，建桌、改桌位与重制码需要 table:manage 权限"
      />

      <el-alert
        v-else-if="!canManage"
        class="tab-tip"
        type="info"
        :closable="false"
        show-icon
        title="当前账号可以开台与清台，但新增/修改桌位与重制二维码需要 table:manage 权限"
      />

      <el-alert
        v-if="tables.length > 0"
        class="tab-tip"
        type="success"
        :closable="false"
        show-icon
        title="把二维码打印出来贴在对应桌上，顾客微信扫码即可进店并自动带上桌号，无需手动输入。"
      />

      <el-table v-loading="tableQuery.isFetching.value" :data="tables" border stripe>
        <el-table-column label="桌号" min-width="120">
          <template #default="{ row }: { row: TableItem }">
            <span class="cell-name">{{ row.tableNo }}</span>
            <p v-if="row.area" class="table-sub-text">{{ row.area }}</p>
          </template>
        </el-table-column>
        <el-table-column label="座位" width="80" align="center">
          <template #default="{ row }: { row: TableItem }">
            <span v-if="row.seats">{{ row.seats }} 人</span>
            <span v-else class="text-muted">--</span>
          </template>
        </el-table-column>
        <el-table-column label="用餐状态" width="210">
          <template #default="{ row }: { row: TableItem }">
            <div class="dining">
              <el-tag
                size="small"
                :type="row.diningStatus === 'dining' ? 'success' : 'info'"
                effect="light"
              >
                {{ row.diningStatus === 'dining' ? '用餐中' : '空闲' }}
              </el-tag>
              <span v-if="row.diningStatus === 'dining'" class="dining__meta">
                {{ diningDuration(row.openedAt) }}
                <template v-if="row.guestCount"> · {{ row.guestCount }} 人</template>
              </span>
              <el-button
                v-if="row.diningStatus === 'idle'"
                text
                type="primary"
                size="small"
                :disabled="!canOperate || row.status !== 'active'"
                @click="askOpen(row)"
              >
                开台
              </el-button>
              <el-button
                v-else
                text
                type="primary"
                size="small"
                :disabled="!canOperate"
                @click="askClose(row)"
              >
                清台
              </el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="排序" width="80" align="center">
          <template #default="{ row }: { row: TableItem }">{{ row.sort }}</template>
        </el-table-column>
        <el-table-column label="桌位二维码" width="140" align="center">
          <template #default="{ row }: { row: TableItem }">
            <el-image
              v-if="row.qrCodeUrl"
              class="qr-thumb"
              :src="qrUrl(row)"
              :preview-src-list="[qrUrl(row)]"
              fit="contain"
              preview-teleported
            />
            <span v-else class="text-muted">未生成</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }: { row: TableItem }">
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
        <el-table-column label="操作" width="290" fixed="right" align="right">
          <template #default="{ row }: { row: TableItem }">
            <el-button text type="primary" :disabled="!canManage" @click="openEdit(row)">
              <el-icon><Edit /></el-icon>
              <span>编辑</span>
            </el-button>
            <el-button text type="primary" :disabled="!canManage" @click="confirmRegenerate(row)">
              <el-icon><RefreshRight /></el-icon>
              <span>重制码</span>
            </el-button>
            <el-button text type="primary" @click="downloadOne(row)">
              <el-icon><Download /></el-icon>
              <span>下载</span>
            </el-button>
            <el-button text type="danger" :disabled="!canManage" @click="confirmRemove(row)">
              <el-icon><Delete /></el-icon>
              <span>删除</span>
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty
            :description="tableQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '还没有桌位，先新增或批量建桌'"
            :image-size="80"
          />
        </template>
      </el-table>

      <p v-if="tables.length === 0 && !tableQuery.isFetching.value" class="tab-tip text-muted">
        提示：桌位二维码是「微信小程序码」，由后端调用微信接口生成。
        若列表里显示「未生成」，说明平台还没配置小程序 AppID/AppSecret，或小程序尚未发布 —— 
        配置完成后点每行的「重制码」即可补生成。
      </p>
    </el-card>

    <TableFormDialog v-model="dialogVisible" :record="editingTable" />

    <el-dialog v-model="batchVisible" title="批量建桌" width="520px" destroy-on-close>
      <el-form label-width="100px">
        <el-form-item label="桌号前缀">
          <el-input v-model="batchForm.prefix" maxlength="8" placeholder="如 A；留空则只有数字" />
        </el-form-item>
        <el-form-item label="起始序号">
          <el-input-number v-model="batchForm.startNo" :min="1" :max="9999" />
        </el-form-item>
        <el-form-item label="生成数量">
          <el-input-number v-model="batchForm.count" :min="1" :max="TABLE_BATCH_MAX" />
          <span class="form-hint form-hint--inline">一次最多 {{ TABLE_BATCH_MAX }} 张</span>
        </el-form-item>
        <el-form-item label="补零位数">
          <el-input-number v-model="batchForm.padLength" :min="1" :max="4" />
          <span class="form-hint form-hint--inline">2 表示 A01</span>
        </el-form-item>
        <el-form-item label="统一区域">
          <el-input v-model="batchForm.area" maxlength="32" placeholder="如：一楼大厅（可不填）" />
        </el-form-item>
        <el-form-item label="统一座位数">
          <el-input-number v-model="batchForm.seats" :min="1" :max="99" />
        </el-form-item>
        <el-form-item label="预览">
          <el-tag type="success">{{ batchPreview }}</el-tag>
        </el-form-item>
      </el-form>

      <p class="form-hint">
        已存在的桌号会被自动跳过，不会覆盖；二维码在生成后由后端逐个调用微信接口制作，
        数量较多时请稍等片刻再刷新列表。
      </p>

      <template #footer>
        <el-button @click="batchVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchSubmitting" @click="submitBatch">开始生成</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="openVisible" :title="`开台 · ${openTarget?.tableNo ?? ''}`" width="420px">
      <el-form label-width="80px">
        <el-form-item label="就餐人数">
          <el-input-number v-model="openGuestCount" :min="1" :max="99" />
        </el-form-item>
      </el-form>
      <p class="form-hint">
        开台只是把桌位标记为「用餐中」，不会创建订单；顾客扫桌上的二维码下单、
        或收银台选这张桌点单都会自动开台。
      </p>
      <template #footer>
        <el-button @click="openVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="openMutation.isPending.value"
          @click="openTarget && openMutation.mutate({ id: openTarget.id, guestCount: openGuestCount })"
        >
          开台
        </el-button>
      </template>
    </el-dialog>
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

.panel__title {
  white-space: nowrap;
}

.panel__stat {
  margin-left: auto;
  margin-right: 12px;
  font-size: 13px;
  font-weight: 400;
  color: #909399;
  white-space: nowrap;
}

.dining {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.dining__meta {
  font-size: 12px;
  color: #67c23a;
}

.cell-name {
  font-weight: 500;
}

.qr-thumb {
  width: 72px;
  height: 72px;
  cursor: zoom-in;
}

.form-hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #909399;
}

.form-hint--inline {
  margin: 0 0 0 8px;
}
</style>
