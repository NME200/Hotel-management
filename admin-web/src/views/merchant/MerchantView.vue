<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Close, Edit, Plus, Refresh, Search, View } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

import { fetchMerchants, updateMerchantStatus } from '@/api/merchant'
import { QUERY_KEYS } from '@/api/keys'
import type { MerchantListItem, MerchantListParams, MerchantStatus } from '@/api/types/merchant'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import { DATE_PATTERN } from '@/constants/date-patterns'
import {
  MERCHANT_STATUS_DICT,
  MERCHANT_STATUS_OPTIONS,
  canAuditMerchant,
  canDisableMerchant,
  canEnableMerchant,
  dictLabel,
} from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { formatCount, formatDateTime } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import PaginationBar from '@/components/common/PaginationBar.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import TimeText from '@/components/common/TimeText.vue'
import MerchantFormDialog from './components/MerchantFormDialog.vue'
import MerchantDetailDrawer from './components/MerchantDetailDrawer.vue'

const route = useRoute()
const authStore = useAuthStore()
const queryClient = useQueryClient()

/** 看板「待审核快捷入口」通过 query.status 带入初始筛选 */
function initialStatus(): MerchantStatus | undefined {
  const raw = route.query.status
  if (typeof raw !== 'string') return undefined
  return MERCHANT_STATUS_DICT[raw as MerchantStatus] ? (raw as MerchantStatus) : undefined
}

const keyword = ref('')
const status = ref<MerchantStatus | undefined>(initialStatus())
const page = ref(DEFAULT_PAGE)
const pageSize = ref(DEFAULT_PAGE_SIZE)

const formVisible = ref(false)
const editingMerchant = ref<MerchantListItem | null>(null)
const drawerVisible = ref(false)
const detailMerchantId = ref<number | null>(null)

const queryParams = computed<MerchantListParams>(() => ({
  keyword: keyword.value.trim() || undefined,
  status: status.value,
  page: page.value,
  pageSize: pageSize.value,
}))

const merchantQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.merchants, 'list', queryParams.value]),
  queryFn: () => fetchMerchants(queryParams.value),
  enabled: computed(() => authStore.can(PERMISSION.merchantRead)),
  placeholderData: keepPreviousData,
})

const rows = computed<MerchantListItem[]>(() => merchantQuery.data.value?.list ?? [])
const total = computed(() => merchantQuery.data.value?.total ?? 0)

const statusMutation = useMutation({
  mutationFn: (variables: { id: number; status: MerchantStatus }) => updateMerchantStatus(variables.id, variables.status),
  onSuccess: (_data, variables) => {
    ElMessage.success(`已更新为「${dictLabel(MERCHANT_STATUS_DICT, variables.status)}」`)
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.merchants })
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.merchantDetail })
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.expiring })
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard })
  },
})

/** 到期时间的展示样式：已过期红色、7 天内黄色 */
function expireClass(row: MerchantListItem): string {
  if (!row.expireAt) return 'expire-cell expire-cell--free'
  const days = dayjs(row.expireAt).endOf('day').diff(dayjs(), 'day')
  if (days < 0) return 'expire-cell expire-cell--danger'
  if (days <= 7) return 'expire-cell expire-cell--warning'
  return 'expire-cell'
}

function openCreate(): void {
  editingMerchant.value = null
  formVisible.value = true
}

function openEdit(row: MerchantListItem): void {
  editingMerchant.value = row
  formVisible.value = true
}

function openDetail(row: MerchantListItem): void {
  detailMerchantId.value = row.id
  drawerVisible.value = true
}

async function confirmStatus(row: MerchantListItem, next: MerchantStatus, title: string, detail: string): Promise<void> {
  if (!authStore.can(PERMISSION.merchantAudit)) {
    ElMessage.warning('没有商户审核权限')
    return
  }
  try {
    await ElMessageBox.confirm(detail, title, {
      type: 'warning',
      confirmButtonText: '确认',
      cancelButtonText: '取消',
    })
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
            placeholder="商户名称 / 编码 / 联系人"
            clearable
            class="toolbar-input"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select v-model="status" placeholder="全部状态" clearable class="toolbar-select" @change="handleSearch">
            <el-option
              v-for="item in MERCHANT_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-space>
        <el-space :size="8">
          <el-button @click="merchantQuery.refetch()">
            <el-icon><Refresh /></el-icon>
            <span>刷新</span>
          </el-button>
          <el-button v-if="authStore.can(PERMISSION.merchantCreate)" type="primary" @click="openCreate">
            <el-icon><Plus /></el-icon>
            <span>开通商户</span>
          </el-button>
        </el-space>
      </div>

      <el-table v-loading="merchantQuery.isFetching.value" :data="rows" border stripe class="merchant-table">
        <el-table-column label="商户" min-width="220">
          <template #default="{ row }: { row: MerchantListItem }">
            <div class="cell-merchant">
              <el-avatar v-if="row.logo" :size="36" :src="row.logo" shape="square" />
              <el-avatar v-else :size="36" shape="square" class="cell-merchant__avatar">{{ row.name.slice(0, 1) }}</el-avatar>
              <div class="cell-text">
                <span class="text-ellipsis">{{ row.name }}</span>
                <p class="table-sub-text table-mono">{{ row.code }}</p>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="联系人" min-width="150">
          <template #default="{ row }: { row: MerchantListItem }">
            <div class="cell-text">
              <span>{{ row.contactName }}</span>
              <p class="table-sub-text">{{ row.contactPhone }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="门店 / 员工" min-width="150">
          <template #default="{ row }: { row: MerchantListItem }">
            <div class="cell-text">
              <span class="text-ellipsis">{{ row.storeName || '暂无门店' }}</span>
              <p class="table-sub-text">{{ formatCount(row.staffCount) }} 名员工</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }: { row: MerchantListItem }">
            <StatusTag :item="MERCHANT_STATUS_DICT[row.status]" />
          </template>
        </el-table-column>
        <el-table-column label="到期时间" width="130">
          <template #default="{ row }: { row: MerchantListItem }">
            <span v-if="row.expireAt" :class="expireClass(row)">{{ formatDateTime(row.expireAt, DATE_PATTERN) }}</span>
            <span v-else class="expire-cell expire-cell--free">不限期</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }: { row: MerchantListItem }"><TimeText :value="row.createdAt" /></template>
        </el-table-column>
        <el-table-column label="操作" width="300" fixed="right" align="right">
          <template #default="{ row }: { row: MerchantListItem }">
            <el-button text type="primary" @click="openDetail(row)">
              <el-icon><View /></el-icon>
              <span>详情</span>
            </el-button>
            <el-button v-if="authStore.can(PERMISSION.merchantUpdate)" text type="primary" @click="openEdit(row)">
              <el-icon><Edit /></el-icon>
              <span>编辑</span>
            </el-button>
            <el-button
              v-if="canAuditMerchant(row.status) && authStore.can(PERMISSION.merchantAudit)"
              text
              type="success"
              :disabled="statusMutation.isPending.value"
              @click="confirmStatus(row, 'active', '审核通过', `确认审核通过「${row.name}」？通过后该商户即可正常营业。`)"
            >
              <el-icon><Check /></el-icon>
              <span>审核通过</span>
            </el-button>
            <el-button
              v-if="canEnableMerchant(row.status) && authStore.can(PERMISSION.merchantAudit)"
              text
              type="success"
              :disabled="statusMutation.isPending.value"
              @click="confirmStatus(row, 'active', '恢复商户', `确认恢复「${row.name}」为正常状态？`)"
            >
              <el-icon><Check /></el-icon>
              <span>恢复</span>
            </el-button>
            <el-button
              v-if="canDisableMerchant(row.status) && authStore.can(PERMISSION.merchantAudit)"
              text
              type="danger"
              :disabled="statusMutation.isPending.value"
              @click="confirmStatus(row, 'disabled', '停用商户', `确认停用「${row.name}」？停用后该商户的商家端与小程序点餐都会被关闭。`)"
            >
              <el-icon><Close /></el-icon>
              <span>停用</span>
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty
            :description="merchantQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '暂无商户'"
            :image-size="80"
          />
        </template>
      </el-table>

      <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" />
    </div>

    <MerchantFormDialog v-model="formVisible" :record="editingMerchant" />
    <MerchantDetailDrawer v-model="drawerVisible" :merchant-id="detailMerchantId" />
  </div>
</template>

<style scoped>
.toolbar-input {
  width: 220px;
}

.toolbar-select {
  width: 140px;
}

.merchant-table {
  padding: 0 16px;
}

.cell-merchant {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.cell-merchant__avatar {
  font-size: 15px;
  background: #4f7cff;
}

.expire-cell {
  color: #1f2937;
}

.expire-cell--free {
  color: #909399;
}

.expire-cell--warning {
  color: #e6a23c;
}

.expire-cell--danger {
  font-weight: 600;
  color: #f56c6c;
}
</style>
