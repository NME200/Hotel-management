<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { fetchOrderDetail } from '@/api/order'
import { QUERY_KEYS } from '@/api/keys'
import type { OrderItem } from '@/api/types/order'
import { DINE_TYPE_DICT, ORDER_STATUS_DICT } from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { formatDateTime, formatMoney } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import StatusTag from '@/components/common/StatusTag.vue'

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{ orderId: number | null }>()

const authStore = useAuthStore()

const detailQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.orders, 'detail', props.orderId ?? 0]),
  queryFn: () => fetchOrderDetail(props.orderId ?? 0),
  enabled: computed(() => visible.value && props.orderId !== null && authStore.can(PERMISSION.orderRead)),
})

const detail = computed(() => detailQuery.data.value ?? null)
const items = computed<OrderItem[]>(() => detail.value?.items ?? [])

const timeline = computed(() => {
  const data = detail.value
  if (!data) return []
  return [
    { label: '下单时间', value: data.createdAt },
    { label: '接单时间', value: data.acceptedAt },
    { label: '完成时间', value: data.completedAt },
  ]
})
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
</style>
