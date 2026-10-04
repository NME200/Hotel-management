<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { createCashierOrder, createPayment, fetchPaymentMethods, previewCashierOrder } from '@/api/cashier'
import type {
  CashierOrderView,
  CashierPaymentMethod,
  CashierPreviewView,
  PaymentChannel,
} from '@/api/types/cashier'
import { PAYMENT_CHANNEL_LABELS } from '@/constants/dictionary'
import { useCartStore } from '@/stores/cart'
import { changeCents, formatMoney } from '@/utils/format'

const visible = defineModel<boolean>({ required: true })

const emit = defineEmits<{ paid: [order: CashierOrderView] }>()

const cart = useCartStore()

/** 收银台能直接代收的只有线下渠道：钱当面收，点一下即完成 */
const DIRECT_CHANNELS: readonly PaymentChannel[] = ['cash', 'offline']

const loading = ref(false)
const submitting = ref(false)
const methods = ref<CashierPaymentMethod[]>([])
const preview = ref<CashierPreviewView | null>(null)
const channel = ref<PaymentChannel>('cash')
/** 现金的实收金额，用于算找零 */
const received = ref<number | null>(null)

const payAmount = computed(() => preview.value?.payAmount ?? 0)

const change = computed(() => {
  if (channel.value !== 'cash' || received.value === null) return 0
  return changeCents(received.value, payAmount.value)
})

const receivedEnough = computed(
  () => channel.value !== 'cash' || (received.value !== null && received.value + 1e-9 >= payAmount.value),
)

const canConfirm = computed(
  () => preview.value !== null && !submitting.value && receivedEnough.value,
)

/**
 * 在线渠道在收银台不可直接代收。
 *
 * 这不是「暂时不做」：微信/支付宝的收银台收款要走**付款码支付（被扫）**，
 * 需要单独的产品权限与真实渠道实现；当前项目只接了 mock，
 * 且 `POST /merchant/payments` 的微信/支付宝分支需要付款人 openid。
 * 与其让收银员点了才失败，不如在这里说清楚该怎么做。
 */
function posBlockReason(method: CashierPaymentMethod): string | null {
  if (DIRECT_CHANNELS.includes(method.channel)) return null
  return '在线收款需顾客在小程序内扫码自助支付，收银台不代收'
}

const directMethods = computed(() => methods.value.filter((item) => DIRECT_CHANNELS.includes(item.channel)))
const onlineMethods = computed(() => methods.value.filter((item) => !DIRECT_CHANNELS.includes(item.channel)))

watch(visible, async (open) => {
  if (!open) return
  channel.value = 'cash'
  received.value = null
  preview.value = null
  loading.value = true
  try {
    const [methodList, priced] = await Promise.all([
      fetchPaymentMethods(),
      previewCashierOrder({
        dineType: cart.dineType,
        memberId: cart.memberId ?? undefined,
        items: cart.toPayload(),
      }),
    ])
    methods.value = methodList
    preview.value = priced
    // 默认把实收填成应收：绝大多数现金交易都是刚好给钱
    received.value = priced.payAmount
  } catch {
    ElMessage.error('结账信息加载失败，请重试')
  } finally {
    loading.value = false
  }
})

function pickChannel(value: PaymentChannel): void {
  channel.value = value
  if (value === 'cash' && received.value === null) {
    received.value = payAmount.value
  }
}

async function handleConfirm(): Promise<void> {
  if (!canConfirm.value || preview.value === null) return
  submitting.value = true
  try {
    // 先建单：金额以后端返回的为准（与上面算价同源，正常不会不一致）
    const order = await createCashierOrder({
      dineType: cart.dineType,
      tableId: cart.dineType === 'dine_in' ? (cart.tableId ?? undefined) : undefined,
      memberId: cart.memberId ?? undefined,
      peopleCount: cart.peopleCount,
      remark: cart.remark.trim() || undefined,
      items: cart.toPayload(),
    })

    // 再收款：现金/收款码创建即成功，订单在同一刻被置为已支付并发取餐码
    await createPayment({ orderId: order.id, channel: channel.value })

    ElMessage.success(
      channel.value === 'cash' && change.value > 0
        ? `已收款，请找零 ${formatMoney(change.value)}`
        : '已收款',
    )
    visible.value = false
    cart.reset()
    emit('paid', order)
  } catch {
    // 建单成功但收款失败时订单会留在「待支付」，收银员可在「今日订单」里继续收款；
    // 这里把话说清楚，避免他以为钱已经收了。
    ElMessage.warning('收款未完成，订单已保存为待支付，可在「今日订单」中继续收款')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="结账收款" width="520px" destroy-on-close>
    <div v-loading="loading" class="checkout">
      <!-- 金额：收银员要照着念一遍 -->
      <div class="checkout__amount">
        <span class="checkout__amount-label">应收</span>
        <span class="checkout__amount-value">{{ formatMoney(payAmount) }}</span>
      </div>
      <div v-if="preview" class="checkout__meta">
        <span>{{ cart.dineType === 'dine_in' ? '堂食' : cart.dineType === 'pickup' ? '自取' : '外送' }}</span>
        <span>共 {{ cart.count }} 件</span>
        <span v-if="preview.discountAmount > 0">优惠 −{{ formatMoney(preview.discountAmount) }}</span>
        <span v-if="cart.memberLabel">会员：{{ cart.memberLabel }}</span>
      </div>

      <!-- 收款方式 -->
      <div class="checkout__section">
        <div class="checkout__section-title">收款方式</div>
        <div class="checkout__methods">
          <button
            v-for="item in directMethods"
            :key="item.channel"
            type="button"
            class="method"
            :class="{ 'method--on': channel === item.channel, 'method--off': !item.available }"
            :disabled="!item.available"
            @click="pickChannel(item.channel)"
          >
            <span class="method__label">{{ item.label }}</span>
            <span v-if="!item.available && item.reason" class="method__reason">{{ item.reason }}</span>
          </button>
        </div>

        <template v-if="onlineMethods.length > 0">
          <div class="checkout__section-title checkout__section-title--sub">在线渠道</div>
          <div class="checkout__methods">
            <button
              v-for="item in onlineMethods"
              :key="item.channel"
              type="button"
              class="method method--off"
              disabled
              :title="posBlockReason(item) ?? ''"
            >
              <span class="method__label">{{ PAYMENT_CHANNEL_LABELS[item.channel] }}</span>
              <span class="method__reason">{{ item.available ? posBlockReason(item) : item.reason }}</span>
            </button>
          </div>
          <p class="checkout__note">
            在线收款请引导顾客扫桌上的二维码，在小程序里自助支付；收银台不代收，
            付款结果可在「今日订单」里核对。
          </p>
        </template>
      </div>

      <!-- 现金找零 -->
      <div v-if="channel === 'cash'" class="checkout__section">
        <div class="checkout__section-title">收现金</div>
        <div class="checkout__cash">
          <span class="checkout__cash-label">实收</span>
          <el-input-number
            v-model="received"
            :min="0"
            :precision="2"
            :step="10"
            size="large"
            controls-position="right"
          />
          <span class="checkout__cash-change">
            找零
            <b :class="{ 'is-warning': !receivedEnough }">{{ formatMoney(change) }}</b>
          </span>
        </div>
        <p v-if="!receivedEnough" class="checkout__note checkout__note--warn">
          实收金额小于应收，请确认后再收款
        </p>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" size="large" :loading="submitting" :disabled="!canConfirm" @click="handleConfirm">
        确认收款 {{ formatMoney(payAmount) }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.checkout {
  min-height: 160px;
}

.checkout__amount {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 10px;
  padding: 12px 0 4px;
}

.checkout__amount-label {
  font-size: 14px;
  color: #606266;
}

.checkout__amount-value {
  font-size: 34px;
  font-weight: 600;
  color: #f56c6c;
}

.checkout__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #909399;
}

.checkout__section {
  margin-top: 12px;
}

.checkout__section-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #303133;
}

.checkout__section-title--sub {
  margin-top: 12px;
  color: #909399;
  font-weight: 400;
}

.checkout__methods {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.method {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 132px;
  padding: 10px 16px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.method:hover:not(:disabled) {
  border-color: var(--cm-brand);
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
  font-size: 15px;
  font-weight: 500;
  color: #303133;
}

.method--on .method__label {
  color: var(--cm-brand);
}

.method__reason {
  font-size: 12px;
  color: #909399;
}

.checkout__note {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
}

.checkout__note--warn {
  color: #e6a23c;
}

.checkout__cash {
  display: flex;
  align-items: center;
  gap: 12px;
}

.checkout__cash-label {
  font-size: 13px;
  color: #606266;
}

.checkout__cash-change {
  font-size: 13px;
  color: #606266;
}

.checkout__cash-change b {
  margin-left: 4px;
  font-size: 18px;
  color: #67c23a;
}

.checkout__cash-change b.is-warning {
  color: #e6a23c;
}
</style>
