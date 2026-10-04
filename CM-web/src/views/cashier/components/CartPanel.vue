<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, Search } from '@element-plus/icons-vue'

import { lookupMember, previewCashierOrder } from '@/api/cashier'
import type { CashierMemberView, CashierPreviewView } from '@/api/types/cashier'
import type { TableItem } from '@/api/types/table'
import { DINE_TYPE_OPTIONS } from '@/constants/dictionary'
import { useCartStore } from '@/stores/cart'
import { formatMoney } from '@/utils/format'

const props = defineProps<{
  tables: TableItem[]
}>()

const emit = defineEmits<{ checkout: [] }>()

const cart = useCartStore()

/* ------------------------------ 算价 ------------------------------ */

const preview = ref<CashierPreviewView | null>(null)
const previewing = ref(false)
let previewTimer: number | undefined

/** 菜品行的指纹：内容没变就不重复请求算价 */
const payloadSignature = computed(() => JSON.stringify(cart.toPayload()))

async function refreshPreview(): Promise<void> {
  if (cart.isEmpty) {
    preview.value = null
    return
  }
  previewing.value = true
  try {
    preview.value = await previewCashierOrder({
      dineType: cart.dineType,
      memberId: cart.memberId ?? undefined,
      items: cart.toPayload(),
    })
  } catch {
    // 算价失败（下架、库存不足）时把合计清空，宁可显示 '--' 也不显示一个旧价
    preview.value = null
  } finally {
    previewing.value = false
  }
}

watch(
  () => [payloadSignature.value, cart.dineType, cart.memberId] as const,
  () => {
    window.clearTimeout(previewTimer)
    // 收银员连点加菜时不必每一下都打接口，250ms 内的连续变更合并成一次算价
    previewTimer = window.setTimeout(() => void refreshPreview(), 250)
  },
  { immediate: true },
)

onBeforeUnmount(() => window.clearTimeout(previewTimer))

/* ------------------------------ 桌位 ------------------------------ */

const activeTables = computed(() =>
  props.tables
    .filter((table) => table.status === 'active')
    .sort((a, b) => a.sort - b.sort || a.tableNo.localeCompare(b.tableNo)),
)

/** 堂食必须选桌位：后端也会挡，但在这里挡掉能少一次失败往返 */
const tableMissing = computed(() => cart.dineType === 'dine_in' && cart.tableId === null)

function handleDineType(value: string): void {
  cart.chooseDineType(value as (typeof DINE_TYPE_OPTIONS)[number]['value'])
}

/* ------------------------------ 会员 ------------------------------ */

const memberPhone = ref('')
const memberQuerying = ref(false)
const member = ref<CashierMemberView | null>(null)
const memberSearched = ref(false)

async function handleLookupMember(): Promise<void> {
  const phone = memberPhone.value.trim()
  if (!/^\d{6,20}$/.test(phone)) {
    ElMessage.warning('请输入顾客手机号')
    return
  }
  memberQuerying.value = true
  memberSearched.value = false
  try {
    member.value = await lookupMember(phone)
    memberSearched.value = true
    if (member.value?.memberId) {
      cart.setMember(member.value.memberId, `${member.value.nickname}（${member.value.levelLabel ?? '会员'}）`)
    } else {
      cart.setMember(null, '')
    }
  } finally {
    memberQuerying.value = false
  }
}

function clearMember(): void {
  member.value = null
  memberSearched.value = false
  memberPhone.value = ''
  cart.setMember(null, '')
}

/* ------------------------------ 提交 ------------------------------ */

const canCheckout = computed(
  () => !cart.isEmpty && !tableMissing.value && preview.value !== null && !previewing.value,
)

function handleCheckout(): void {
  if (cart.isEmpty) {
    ElMessage.warning('请先选择菜品')
    return
  }
  if (tableMissing.value) {
    ElMessage.warning('堂食请先选择桌位')
    return
  }
  if (preview.value === null) {
    ElMessage.warning('金额尚未算出，请稍候')
    return
  }
  emit('checkout')
}
</script>

<template>
  <div class="cart">
    <!-- 1. 就餐方式 -->
    <div class="cart__block">
      <div class="cart__label">就餐方式</div>
      <el-radio-group :model-value="cart.dineType" size="default" @change="handleDineType">
        <el-radio-button v-for="item in DINE_TYPE_OPTIONS" :key="item.value" :value="item.value">
          {{ item.label }}
        </el-radio-button>
      </el-radio-group>
    </div>

    <!-- 2. 桌位（仅堂食） -->
    <div v-if="cart.dineType === 'dine_in'" class="cart__block">
      <div class="cart__label">
        桌位
        <span class="cart__label-hint">带「用餐中」的是已开台的桌</span>
      </div>
      <el-select
        v-model="cart.tableId"
        placeholder="请选择桌位"
        filterable
        style="width: 100%"
      >
        <el-option
          v-for="table in activeTables"
          :key="table.id"
          :label="`${table.tableNo}${table.area ? ' · ' + table.area : ''}${table.diningStatus === 'dining' ? '（用餐中）' : ''}`"
          :value="table.id"
        />
      </el-select>
      <div class="cart__row">
        <span class="cart__row-label">人数</span>
        <el-input-number v-model="cart.peopleCount" :min="1" :max="50" size="small" />
      </div>
    </div>

    <!-- 3. 会员识别 -->
    <div class="cart__block">
      <div class="cart__label">
        会员
        <span class="cart__label-hint">报手机号可享会员价</span>
      </div>
      <div class="cart__member">
        <el-input
          v-model="memberPhone"
          placeholder="顾客手机号"
          maxlength="20"
          clearable
          @keyup.enter="handleLookupMember"
          @clear="clearMember"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button :loading="memberQuerying" @click="handleLookupMember">查询</el-button>
      </div>

      <div v-if="cart.memberId !== null" class="cart__member-hit">
        <span class="cart__member-name">{{ cart.memberLabel }}</span>
        <el-button text type="danger" :icon="Delete" @click="clearMember">取消</el-button>
      </div>
      <p v-else-if="memberSearched && member" class="cart__member-tip">{{ member.hint }}</p>
      <p v-else-if="memberSearched && !member" class="cart__member-tip">没有查到该手机号的顾客记录</p>
    </div>

    <!-- 4. 菜品行 -->
    <div class="cart__lines pos-scroll">
      <div v-if="cart.isEmpty" class="cart__empty">
        <p>还没有选菜</p>
        <p class="text-muted">点左侧菜品即可加入本单</p>
      </div>
      <div v-for="line in cart.lines" :key="line.key" class="line">
        <div class="line__main">
          <div class="line__name text-ellipsis">{{ line.name }}</div>
          <div v-if="line.skuName || line.optionSummary" class="line__spec text-ellipsis">
            {{ [line.skuName, line.optionSummary].filter(Boolean).join(' / ') }}
          </div>
        </div>
        <div class="line__actions">
          <el-button size="small" :disabled="line.quantity <= 1" @click="cart.changeQuantity(line.key, -1)">
            −
          </el-button>
          <span class="line__qty">{{ line.quantity }}</span>
          <el-button size="small" @click="cart.changeQuantity(line.key, 1)">＋</el-button>
          <el-button text type="danger" :icon="Delete" @click="cart.removeLine(line.key)" />
        </div>
      </div>
    </div>

    <!-- 5. 合计与结算 -->
    <div class="cart__foot">
      <div class="cart__sum">
        <span class="cart__sum-label">应收</span>
        <span v-if="previewing" class="cart__sum-value cart__sum-value--muted">算价中…</span>
        <span v-else-if="preview" class="cart__sum-value">{{ formatMoney(preview.payAmount) }}</span>
        <span v-else class="cart__sum-value cart__sum-value--muted">--</span>
      </div>
      <div v-if="preview" class="cart__sum-hint">
        <span>共 {{ cart.count }} 件</span>
        <span v-if="preview.discountAmount > 0">优惠 −{{ formatMoney(preview.discountAmount) }}</span>
        <span v-if="preview.memberPriced">已享会员价</span>
        <span v-else-if="preview.promotionPriced">已享活动价</span>
      </div>
      <el-button type="primary" size="large" class="cart__submit" :disabled="!canCheckout" @click="handleCheckout">
        结账收款
      </el-button>
      <el-button v-if="!cart.isEmpty" text class="cart__clear" @click="cart.reset()">清空本单</el-button>
    </div>
  </div>
</template>

<style scoped>
.cart {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.cart__block {
  padding: 10px 12px;
  border-bottom: 1px solid #ebeef5;
}

.cart__label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #303133;
}

.cart__label-hint {
  font-size: 12px;
  font-weight: 400;
  color: #a8abb2;
}

.cart__row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.cart__row-label {
  font-size: 13px;
  color: #606266;
}

.cart__member {
  display: flex;
  gap: 8px;
}

.cart__member-hit {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: #eef2ff;
}

.cart__member-name {
  font-size: 13px;
  color: var(--cm-brand);
}

.cart__member-tip {
  margin: 8px 0 0;
  font-size: 12px;
  color: #e6a23c;
}

.cart__lines {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 12px;
}

.cart__empty {
  padding: 32px 0;
  text-align: center;
  font-size: 13px;
  color: #606266;
}

.cart__empty .text-muted {
  margin-top: 6px;
  font-size: 12px;
}

.line {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px dashed #ebeef5;
}

.line__main {
  flex: 1;
  min-width: 0;
}

.line__name {
  font-size: 13px;
  font-weight: 500;
}

.line__spec {
  margin-top: 2px;
  font-size: 12px;
  color: #909399;
}

.line__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.line__qty {
  min-width: 24px;
  text-align: center;
  font-size: 14px;
  font-weight: 500;
}

.cart__foot {
  padding: 12px;
  border-top: 1px solid #ebeef5;
  background: #fafbfc;
}

.cart__sum {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.cart__sum-label {
  font-size: 14px;
  color: #606266;
}

.cart__sum-value {
  font-size: 26px;
  font-weight: 600;
  color: #f56c6c;
}

.cart__sum-value--muted {
  color: #c0c4cc;
  font-size: 18px;
}

.cart__sum-hint {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}

.cart__submit {
  width: 100%;
  margin-top: 10px;
}

.cart__clear {
  width: 100%;
  margin: 4px 0 0;
}
</style>
