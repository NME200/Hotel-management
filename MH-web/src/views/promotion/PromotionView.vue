<script setup lang="ts">
import { computed, ref } from 'vue'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Plus, Refresh, Search } from '@element-plus/icons-vue'

import { deletePromotion, fetchPromotions, updatePromotionStatus } from '@/api/promotion'
import { QUERY_KEYS } from '@/api/keys'
import type { Promotion, PromotionListParams, PromotionStatus } from '@/api/types/promotion'
import {
  PROMOTION_STATUS_OPTIONS,
  promotionActive,
  promotionPhase,
  promotionPriceText,
  promotionScopeText,
} from '@/constants/dictionary'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import { PERMISSION } from '@/constants/permission'
import { formatDateTime } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import PaginationBar from '@/components/common/PaginationBar.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import PromotionFormDialog from './components/PromotionFormDialog.vue'

const authStore = useAuthStore()
const queryClient = useQueryClient()

const keyword = ref('')
const status = ref<PromotionStatus | ''>('')
const page = ref(DEFAULT_PAGE)
const pageSize = ref(DEFAULT_PAGE_SIZE)
const dialogVisible = ref(false)
const editingPromotion = ref<Promotion | null>(null)

const queryParams = computed<PromotionListParams>(() => ({
  keyword: keyword.value.trim() || undefined,
  status: status.value || undefined,
  page: page.value,
  pageSize: pageSize.value,
}))

const promotionQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.promotions, 'list', queryParams.value]),
  queryFn: () => fetchPromotions(queryParams.value),
  enabled: computed(() => authStore.can(PERMISSION.promotionRead)),
  placeholderData: keepPreviousData,
})

const rows = computed<Promotion[]>(() => promotionQuery.data.value?.list ?? [])
const total = computed(() => promotionQuery.data.value?.total ?? 0)

const toggleMutation = useMutation({
  mutationFn: (variables: { id: number; status: PromotionStatus }) =>
    updatePromotionStatus(variables.id, variables.status),
  onSuccess: () => {
    ElMessage.success('活动状态已更新，顾客端立即按新状态结算')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.promotions })
  },
})

/** 生效期一栏要能看出「还没到」和「已经过」，商户才不会以为价格配错了 */
function periodText(row: Promotion): string {
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
  status.value = ''
  page.value = DEFAULT_PAGE
}

function openCreate(): void {
  editingPromotion.value = null
  dialogVisible.value = true
}

function openEdit(row: Promotion): void {
  editingPromotion.value = row
  dialogVisible.value = true
}

function handleToggle(row: Promotion, value: boolean): void {
  if (!authStore.can(PERMISSION.promotionUpdate)) {
    ElMessage.warning('没有活动启停权限')
    return
  }
  toggleMutation.mutate({ id: row.id, status: value ? 'enabled' : 'disabled' })
}

async function handleDelete(row: Promotion): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确认删除活动「${row.name}」？删除后对应菜品立刻按原价结算，关联它的运营位卡需要重新配置。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await deletePromotion(row.id)
    ElMessage.success('活动已删除')
    if (rows.value.length === 1 && page.value > DEFAULT_PAGE) page.value -= 1
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.promotions })
    // 运营位卡的关联跳转也指向这里，删成功后让活动列表重新拉一次
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
            placeholder="搜索活动名称"
            clearable
            class="toolbar-input"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select v-model="status" placeholder="状态" clearable class="toolbar-select" @change="handleSearch">
            <el-option
              v-for="item in PROMOTION_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-space>
        <el-space :size="8">
          <el-button @click="promotionQuery.refetch()">
            <el-icon><Refresh /></el-icon>
            <span>刷新</span>
          </el-button>
          <el-button v-if="authStore.can(PERMISSION.promotionCreate)" type="primary" @click="openCreate">
            <el-icon><Plus /></el-icon>
            <span>新增活动</span>
          </el-button>
        </el-space>
      </div>

      <el-alert
        type="warning"
        :closable="false"
        show-icon
        class="promotion-tip"
        title="限时活动改的是顾客真实结算价：活动价与会员价取低（不叠加），优惠券仍能在这个价上继续抵扣；停用或过了结束时间，立即恢复原价，已下的订单不受影响。"
      />

      <el-table v-loading="promotionQuery.isFetching.value" :data="rows" border stripe class="promotion-table">
        <el-table-column label="活动名称" min-width="180">
          <template #default="{ row }: { row: Promotion }">
            <div class="cell-text">
              <span class="text-ellipsis">{{ row.name }}</span>
              <p class="table-sub-text text-ellipsis">角标：{{ row.badge || '活动' }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="优惠方式" min-width="150">
          <template #default="{ row }: { row: Promotion }">{{ promotionPriceText(row) }}</template>
        </el-table-column>
        <el-table-column label="适用范围" width="120" align="center">
          <template #default="{ row }: { row: Promotion }">{{ promotionScopeText(row) }}</template>
        </el-table-column>
        <el-table-column label="生效期" width="230">
          <template #default="{ row }: { row: Promotion }">{{ periodText(row) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="150" align="center">
          <template #default="{ row }: { row: Promotion }">
            <div class="cell-status">
              <StatusTag :item="promotionPhase(row)" />
              <el-switch
                :model-value="promotionActive(row)"
                size="small"
                :disabled="!authStore.can(PERMISSION.promotionUpdate) || toggleMutation.isPending.value"
                @update:model-value="(value: boolean) => handleToggle(row, value)"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right" align="right">
          <template #default="{ row }: { row: Promotion }">
            <el-button v-if="authStore.can(PERMISSION.promotionUpdate)" text type="primary" @click="openEdit(row)">
              <el-icon><Edit /></el-icon>
              <span>编辑</span>
            </el-button>
            <el-button v-if="authStore.can(PERMISSION.promotionDelete)" text type="danger" @click="handleDelete(row)">
              <el-icon><Delete /></el-icon>
              <span>删除</span>
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty
            :description="promotionQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '暂无活动，新增一个即可让顾客按活动价结算'"
            :image-size="80"
          />
        </template>
      </el-table>

      <PaginationBar v-model:page="page" v-model:page-size="pageSize" :total="total" />
    </div>

    <PromotionFormDialog v-model="dialogVisible" :record="editingPromotion" />
  </div>
</template>

<style scoped>
.toolbar-input {
  width: 220px;
}

.toolbar-select {
  width: 150px;
}

.promotion-tip {
  margin: 0 16px 12px;
}

.promotion-table {
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
