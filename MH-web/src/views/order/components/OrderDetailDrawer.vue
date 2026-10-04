<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { ElMessage } from 'element-plus'
import { Printer, Document, RefreshRight } from '@element-plus/icons-vue'

import { fetchOrderDetail } from '@/api/order'
import { fetchPrintTasksByOrder, retryPrintTask } from '@/api/print'
import { QUERY_KEYS } from '@/api/keys'
import type { OrderItem } from '@/api/types/order'
import type { PrintTaskItem } from '@/api/types/print'
import { DINE_TYPE_DICT, ORDER_STATUS_DICT } from '@/constants/dictionary'
import {
  PRINT_TASK_STATUS_DICT,
  PRINT_TICKET_TYPE_DICT,
  PRINT_TRIGGER_LABEL,
} from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { formatDateTime, formatMoney } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import { useReceiptPrint } from '@/utils/print/use-receipt-print'
import StatusTag from '@/components/common/StatusTag.vue'

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{ orderId: number | null }>()

const authStore = useAuthStore()
const { printing, printOrderReceipt, previewOrderReceipt } = useReceiptPrint()

const detailQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.orders, 'detail', props.orderId ?? 0]),
  queryFn: () => fetchOrderDetail(props.orderId ?? 0),
  enabled: computed(() => visible.value && props.orderId !== null && authStore.can(PERMISSION.orderRead)),
})

/** 打印流水跟着抽屉打开一起拉，只读权限即可看 */
const tasksQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.printTasks, 'order', props.orderId ?? 0]),
  queryFn: () => fetchPrintTasksByOrder(props.orderId ?? 0),
  enabled: computed(() => visible.value && props.orderId !== null && authStore.can(PERMISSION.printRead)),
})

const detail = computed(() => detailQuery.data.value ?? null)
const items = computed<OrderItem[]>(() => detail.value?.items ?? [])
const tasks = computed(() => tasksQuery.data.value ?? [])

const canPrint = computed(() => authStore.can(PERMISSION.printCreate))
const canRetry = computed(() => authStore.can(PERMISSION.printCreate))

const timeline = computed(() => {
  const data = detail.value
  if (!data) return []
  return [
    { label: '下单时间', value: data.createdAt },
    { label: '接单时间', value: data.acceptedAt },
    { label: '完成时间', value: data.completedAt },
  ]
})

function handlePrint(ticketType: 'customer' | 'kitchen'): void {
  if (props.orderId === null) return
  void printOrderReceipt({ orderId: props.orderId, ticketType, trigger: 'manual' })
}

function handlePreview(ticketType: 'customer' | 'kitchen'): void {
  if (props.orderId === null) return
  void previewOrderReceipt(props.orderId, ticketType)
}

async function handleRetry(taskId: number): Promise<void> {
  try {
    await retryPrintTask(taskId)
    ElMessage.success('已重新发起打印')
    void tasksQuery.refetch()
  } catch {
    // 失败提示由请求拦截器统一给出
  }
}
</script>

<template>
  <el-drawer v-model="visible" title="订单详情" size="720px" direction="rtl">
    <div v-loading="detailQuery.isFetching.value">
      <template v-if="detail">
        <div class="detail__head">
          <div>
            <p class="detail__no">{{ detail.orderNo }}</p>
            <p class="text-muted">下单于 {{ formatDateTime(detail.createdAt) }}</p>
          </div>
          <div class="detail__status">
            <StatusTag :item="ORDER_STATUS_DICT[detail.status]" size="default" />
            <el-tag v-if="detail.pickupCode" type="warning" effect="plain" size="default">
              取餐码 {{ detail.pickupCode }}
            </el-tag>
          </div>
        </div>

        <el-descriptions :column="2" border class="detail__desc">
          <el-descriptions-item label="就餐方式">
            <StatusTag :item="DINE_TYPE_DICT[detail.dineType]" />
          </el-descriptions-item>
          <el-descriptions-item label="桌号 / 人数">
            {{ detail.dineType === 'dine_in' ? `${detail.tableNo || '--'} / ${detail.peopleCount} 人` : '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="会员">
            {{ detail.memberNickname || '散客' }}
          </el-descriptions-item>
          <el-descriptions-item label="菜品数">{{ detail.itemCount }} 件</el-descriptions-item>
          <el-descriptions-item label="顾客备注" :span="2">{{ detail.remark || '无' }}</el-descriptions-item>
        </el-descriptions>

        <h4 class="detail__title">菜品明细</h4>
        <el-table :data="items" border size="small">
          <el-table-column label="菜品" min-width="200">
            <template #default="{ row }: { row: OrderItem }">
              <div class="cell-item">
                <el-image v-if="row.dishImage" :src="row.dishImage" fit="cover" class="cell-item__thumb">
                  <template #error>
                    <div class="cell-item__thumb cell-item__thumb--broken">图</div>
                  </template>
                </el-image>
                <div class="cell-item__text">
                  <span class="text-ellipsis">{{ row.dishName }}</span>
                  <p v-if="row.specDesc" class="table-sub-text">{{ row.specDesc }}</p>
                  <p v-if="row.remark" class="table-sub-text">备注：{{ row.remark }}</p>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="单价" width="100" align="right">
            <template #default="{ row }: { row: OrderItem }">{{ formatMoney(row.unitPrice) }}</template>
          </el-table-column>
          <el-table-column label="数量" width="80" align="center">
            <template #default="{ row }: { row: OrderItem }">×{{ row.quantity }}</template>
          </el-table-column>
          <el-table-column label="小计" width="110" align="right">
            <template #default="{ row }: { row: OrderItem }">{{ formatMoney(row.totalAmount) }}</template>
          </el-table-column>
          <template #empty>
            <el-empty description="暂无菜品明细" :image-size="60" />
          </template>
        </el-table>

        <div class="detail__amounts">
          <div class="detail__amount-row">
            <span>菜品金额</span><span>{{ formatMoney(detail.dishAmount) }}</span>
          </div>
          <div class="detail__amount-row">
            <span>打包费</span><span>{{ formatMoney(detail.packingAmount) }}</span>
          </div>
          <div class="detail__amount-row">
            <span>配送费</span><span>{{ formatMoney(detail.deliveryAmount) }}</span>
          </div>
          <div class="detail__amount-row detail__amount-row--discount">
            <span>优惠金额</span><span>-{{ formatMoney(detail.discountAmount) }}</span>
          </div>
          <div class="detail__amount-row detail__amount-row--total">
            <span>实付金额</span><span>{{ formatMoney(detail.payAmount) }}</span>
          </div>
        </div>

        <h4 class="detail__title">小票打印</h4>
        <div class="print-bar">
          <el-space wrap :size="8">
            <el-button
              v-if="canPrint"
              type="primary"
              :loading="printing"
              @click="handlePrint('customer')"
            >
              <el-icon><Printer /></el-icon>
              <span>打印顾客小票</span>
            </el-button>
            <el-button
              v-if="canPrint"
              :loading="printing"
              @click="handlePrint('kitchen')"
            >
              <el-icon><Printer /></el-icon>
              <span>打印后厨小票</span>
            </el-button>
            <el-button text @click="handlePreview('customer')">
              <el-icon><Document /></el-icon>
              <span>预览版面</span>
            </el-button>
          </el-space>
        </div>

        <el-table
          v-if="tasks.length > 0"
          :data="tasks"
          border
          size="small"
          class="print-table"
        >
          <el-table-column label="票种" width="110" align="center">
            <template #default="{ row }: { row: PrintTaskItem }">
              <StatusTag :item="PRINT_TICKET_TYPE_DICT[row.ticketType]" />
            </template>
          </el-table-column>
          <el-table-column label="份数" width="70" align="center">
            <template #default="{ row }: { row: PrintTaskItem }">×{{ row.copies }}</template>
          </el-table-column>
          <el-table-column label="打印机" min-width="120">
            <template #default="{ row }: { row: PrintTaskItem }">
              <span v-if="row.printerName">{{ row.printerName }}</span>
              <span v-else class="text-muted">未配置</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110" align="center">
            <template #default="{ row }: { row: PrintTaskItem }">
              <StatusTag :item="PRINT_TASK_STATUS_DICT[row.status]" />
              <p v-if="row.retryCount > 0" class="table-sub-text">已重试 {{ row.retryCount }} 次</p>
            </template>
          </el-table-column>
          <el-table-column label="触发 / 时间" min-width="150">
            <template #default="{ row }: { row: PrintTaskItem }">
              <p class="table-sub-text">
                {{ PRINT_TRIGGER_LABEL[row.trigger ?? 'manual'] ?? row.trigger }}
                <span v-if="row.operatorName">· {{ row.operatorName }}</span>
              </p>
              <p class="table-sub-text">{{ formatDateTime(row.printedAt || row.createdAt) }}</p>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90" align="right">
            <template #default="{ row }: { row: PrintTaskItem }">
              <el-button
                v-if="canRetry && row.status === 'failed'"
                text
                type="primary"
                @click="handleRetry(row.id)"
              >
                <el-icon><RefreshRight /></el-icon>
                <span>重试</span>
              </el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="暂无打印记录" :image-size="50" />
          </template>
        </el-table>
        <p v-else-if="!tasksQuery.isFetching.value" class="print-empty text-muted">
          本单还没有打印记录
        </p>

        <h4 class="detail__title">订单进度</h4>
        <el-timeline class="detail__timeline">
          <el-timeline-item
            v-for="node in timeline"
            :key="node.label"
            :timestamp="node.value ? formatDateTime(node.value) : '未发生'"
            placement="top"
            :type="node.value ? 'primary' : 'info'"
            :hollow="!node.value"
          >
            {{ node.label }}
          </el-timeline-item>
        </el-timeline>
      </template>

      <el-empty
        v-else-if="!detailQuery.isFetching.value"
        :description="detailQuery.isError.value ? '详情加载失败，请确认后端服务已启动' : '暂无详情'"
        :image-size="80"
      />
    </div>
  </el-drawer>
</template>

<style scoped>
.detail__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.detail__no {
  margin: 0 0 4px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 16px;
  font-weight: 600;
}

.detail__status {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  align-items: center;
}

.detail__desc {
  margin-bottom: 20px;
}

.detail__title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
}

.detail__amounts {
  max-width: 320px;
  margin: 16px 0 24px;
  margin-left: auto;
}

.detail__amount-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
  color: #606266;
}

.detail__amount-row--discount {
  color: #67c23a;
}

.detail__amount-row--total {
  font-size: 15px;
  font-weight: 600;
  color: #f56c6c;
  border-top: 1px solid #eef1f6;
  padding-top: 8px;
  margin-top: 4px;
}

.cell-item {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.cell-item__thumb {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 6px;
}

.cell-item__thumb--broken {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #c0c4cc;
  background: #f4f6fa;
  border: 1px dashed #dcdfe6;
}

.cell-item__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.detail__timeline {
  padding-left: 4px;
}

.print-bar {
  margin-bottom: 12px;
}

.print-table {
  margin-bottom: 24px;
}

.print-empty {
  margin: 0 0 24px;
  font-size: 13px;
}
</style>
