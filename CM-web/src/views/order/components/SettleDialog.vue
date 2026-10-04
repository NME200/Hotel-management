<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { createPayment, fetchPaymentMethods } from '@/api/cashier'
import type { CashierPaymentMethod, PaymentChannel } from '@/api/types/cashier'
import type { OrderItem } from '@/api/types/order'
import { changeCents, formatMoney } from '@/utils/format'

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{
  /** 待收款的订单；为空表示弹窗没打开 */
  order: OrderItem | null
}>()

const emit = defineEmits<{ paid: [] }>()

/** 收银台能直接代收的只有线下渠道（现金、收款码） */
const DIRECT_CHANNELS: readonly PaymentChannel[] = ['cash', 'offline']

const loading = ref(false)
const submitting = ref(false)
const methods = ref<CashierPaymentMethod[]>([])
const channel = ref<PaymentChannel>('cash')
const received = ref<number | null>(null)

const payAmount = computed(() => props.order?.payAmount ?? 0)
const change = computed(() =>
  channel.value === 'cash' && received.value !== null ? changeCents(received.value, payAmount.value) : 0,
)
const receivedEnough = computed(
  () => channel.value !== 'cash' || (received.value !== null && received.value + 1e-9 >= payAmount.value),
)

const directMethods = computed(() => methods.value.filter((item) => DIRECT_CHANNELS.includes(item.channel)))
const canConfirm = computed(() => props.order !== null && !submitting.value && receivedEnough.value)

watch(visible, async (open) => {
  if (!open) return
  channel.value = 'cash'
  received.value = props.order?.payAmount ?? 0
  loading.value = true
  try {
    methods.value = await fetchPaymentMethods()
  } catch {
    ElMessage.error('收款方式加载失败，请重试')
  } finally {
    loading.value = false
  }
})

async function handleConfirm(): Promise<void> {
  const order = props.order
  if (!order || !canConfirm.value) return
  submitting.value = true
  try {
    await createPayment({ orderId: order.id, channel: channel.value })
    ElMessage.success(
      channel.value === 'cash' && change.value > 0
        ? `已收款，请找零 ${formatMoney(change.value)}`
        : '已收款',
    )
    visible.value = false
    emit('paid')
  } catch {
    ElMessage.warning('收款未完成，请重试或改用其他收款方式')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="收款" width="460px" destroy-on-close>
    <div v-loading="loading" class="settle">
      <div class="settle__row">
        <span class="settle__label">订单号</span>
        <span class="settle__value">{{ order?.orderNo ?? '--' }}</span>
      </div>
      <div class="settle__row">
        <span class="settle__label">应收</span>
        <span class="settle__amount">{{ formatMoney(payAmount) }}</span>
      </div>

      <div class="settle__section">
        <div class="settle__section-title">收款方式</div>
        <div class="settle__methods">
          <button
            v-for="item in directMethods"
            :key="item.channel"
            type="button"
            class="method"
            :class="{ 'method--on': channel === item.channel, 'method--off': !item.available }"
            :disabled="!item.available"
            @click="channel = item.channel"
          >
            <span class="method__label">{{ item.label }}</span>
            <span v-if="!item.available && item.reason" class="method__reason">{{ item.reason }}</span>
          </button>
        </div>
      </div>

      <div v-if="channel === 'cash'" class="settle__section">
        <div class="settle__section-title">收现金</div>
        <div class="settle__cash">
          <span class="settle__label">实收</span>
          <el-input-number v-model="received" :min="0" :precision="2" :step="10" controls-position="right" />
          <span class="settle__change">
            找零 <b :class="{ 'is-warning': !receivedEnough }">{{ formatMoney(change) }}</b>
          </span>
        </div>
      </div>

      <p class="settle__note">
        顾客已在小程序自助支付的订单会自动变为「已支付」，无需在这里重复收款。
      </p>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" :disabled="!canConfirm" @click="handleConfirm">
        确认收款 {{ formatMoney(payAmount) }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.settle__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 4px 0;
}

.settle__label {
  font-size: 13px;
  color: #606266;
}

.settle__value {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 13px;
}

.settle__amount {
  font-size: 26px;
  font-weight: 600;
  color: #f56c6c;
}

.settle__section {
  margin-top: 12px;
}

.settle__section-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #303133;
}

.settle__methods {
  display: flex;
  gap: 10px;
}

.method {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 120px;
  padding: 8px 14px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.method--on {
  border-color: var(--cm-brand);
  background: #eef2ff;
}

.method--off {
  opacity: 0.6;
  cursor: not-allowed;
}

.method__label {
  font-size: 14px;
  font-weight: 500;
}

.method--on .method__label {
  color: var(--cm-brand);
}

.method__reason {
  font-size: 12px;
  color: #909399;
}

.settle__cash {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settle__change {
  font-size: 13px;
  color: #606266;
}

.settle__change b {
  margin-left: 4px;
  font-size: 18px;
  color: #67c23a;
}

.settle__change b.is-warning {
  color: #e6a23c;
}

.settle__note {
  margin: 14px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
}
</style>
