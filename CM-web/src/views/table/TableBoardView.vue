<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'

import { QUERY_KEYS } from '@/api/keys'
import { closeTable, fetchTables, openTable } from '@/api/table'
import type { TableItem } from '@/api/types/table'
import { PERMISSION } from '@/constants/permission'
import { useAuthStore } from '@/stores/auth'
import { useCartStore } from '@/stores/cart'
import { diningDuration } from '@/utils/format'

const router = useRouter()
const queryClient = useQueryClient()
const auth = useAuthStore()
const cart = useCartStore()

const canOperate = computed(() => auth.can(PERMISSION.tableOperate))

const tableQuery = useQuery({
  queryKey: QUERY_KEYS.tables,
  queryFn: () => fetchTables(),
})

const tables = computed<TableItem[]>(() =>
  [...(tableQuery.data.value ?? [])].sort(
    (a, b) => a.sort - b.sort || a.tableNo.localeCompare(b.tableNo),
  ),
)

const idleCount = computed(() => tables.value.filter((item) => item.diningStatus === 'idle').length)
const diningCount = computed(() => tables.value.filter((item) => item.diningStatus === 'dining').length)

const openVisible = ref(false)
const openTarget = ref<TableItem | null>(null)
const openGuestCount = ref(2)

function askOpen(table: TableItem): void {
  openTarget.value = table
  openGuestCount.value = table.seats ?? 2
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
  mutationFn: (variables: { id: number; force: boolean }) => closeTable(variables.id, { force: variables.force }),
  onSuccess: () => {
    ElMessage.success('已清台')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tables })
  },
})

/**
 * 清台：桌上还有未结账订单时后端会拒绝。
 * 这里把「强制清台」做成第二次确认，而不是自动重试 —— 顾客跑单是真的会发生，
 * 但必须是收银员明确知道自己在跳过未结账检查。
 */
async function askClose(table: TableItem): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认清台「${table.tableNo}」？`, '清台', {
      confirmButtonText: '清台',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  try {
    await closeMutation.mutateAsync({ id: table.id, force: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    // 只有「还有未结账订单」这一种情况才提供强制清台
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
    closeMutation.mutate({ id: table.id, force: true })
  }
}

/** 去点单：把桌位与堂食方式预置到本单，收银员落地即可选菜 */
function goOrder(table: TableItem): void {
  cart.chooseDineType('dine_in')
  cart.tableId = table.id
  if (table.guestCount) cart.peopleCount = table.guestCount
  void router.push('/cashier')
}
</script>

<template>
  <div class="board">
    <div class="board__head">
      <div class="board__stats">
        <span class="stat stat--idle">空闲 {{ idleCount }}</span>
        <span class="stat stat--dining">用餐中 {{ diningCount }}</span>
        <span class="stat">共 {{ tables.length }} 桌</span>
      </div>
      <el-button :icon="Refresh" :loading="tableQuery.isFetching.value" @click="tableQuery.refetch()">
        刷新
      </el-button>
    </div>

    <div v-loading="tableQuery.isFetching.value" class="board__body">
      <el-empty
        v-if="tables.length === 0 && !tableQuery.isFetching.value"
        description="还没有桌位，请先在商家端「桌位管理」里建桌"
      />

      <div class="board__grid">
        <div
          v-for="table in tables"
          :key="table.id"
          class="card"
          :class="{
            'card--dining': table.diningStatus === 'dining',
            'card--off': table.status !== 'active',
          }"
        >
          <div class="card__head">
            <span class="card__no">{{ table.tableNo }}</span>
            <el-tag
              size="small"
              :type="table.diningStatus === 'dining' ? 'success' : 'info'"
              effect="light"
            >
              {{ table.diningStatus === 'dining' ? '用餐中' : '空闲' }}
            </el-tag>
          </div>

          <div class="card__meta">
            <span v-if="table.area">{{ table.area }}</span>
            <span v-if="table.seats">{{ table.seats }} 座</span>
            <span v-if="table.status !== 'active'" class="card__off-tag">已停用</span>
          </div>

          <div class="card__dining">
            <template v-if="table.diningStatus === 'dining'">
              <span>已用餐 {{ diningDuration(table.openedAt) }}</span>
              <span v-if="table.guestCount">{{ table.guestCount }} 人</span>
            </template>
            <span v-else class="text-muted">未开台</span>
          </div>

          <div class="card__actions">
            <template v-if="table.status === 'active'">
              <el-button
                v-if="table.diningStatus === 'idle'"
                size="small"
                type="primary"
                :disabled="!canOperate"
                @click="askOpen(table)"
              >
                开台
              </el-button>
              <template v-else>
                <el-button size="small" type="primary" @click="goOrder(table)">去点单</el-button>
                <el-button size="small" :disabled="!canOperate" @click="askClose(table)">清台</el-button>
              </template>
            </template>
            <span v-else class="text-muted card__hint">停用的桌位不可开台</span>
          </div>
        </div>
      </div>
    </div>

    <el-dialog v-model="openVisible" :title="`开台 · ${openTarget?.tableNo ?? ''}`" width="380px">
      <el-form label-width="72px">
        <el-form-item label="就餐人数">
          <el-input-number v-model="openGuestCount" :min="1" :max="99" />
        </el-form-item>
      </el-form>
      <p class="text-muted dialog-hint">
        开台只是把桌位标记为「用餐中」，不建订单；点单时选这张桌即可，收银台也会自动补开台。
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
.board {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.board__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
  flex-shrink: 0;
}

.board__stats {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: #606266;
}

.stat--idle {
  color: #909399;
}

.stat--dining {
  color: #67c23a;
  font-weight: 500;
}

.board__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
}

.board__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
  gap: 12px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid #ebeef5;
  border-left: 4px solid #dcdfe6;
  border-radius: var(--cm-radius);
  background: #fff;
  box-shadow: var(--cm-shadow);
}

.card--dining {
  border-left-color: #67c23a;
  background: #f6fdf9;
}

.card--off {
  opacity: 0.6;
}

.card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card__no {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: #909399;
}

.card__off-tag {
  color: #f56c6c;
}

.card__dining {
  display: flex;
  gap: 10px;
  min-height: 18px;
  font-size: 12px;
  color: #67c23a;
}

.card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.card__hint {
  font-size: 12px;
}

.dialog-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}
</style>
