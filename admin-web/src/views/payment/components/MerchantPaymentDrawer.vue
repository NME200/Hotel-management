<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { fetchMerchantPaymentChannelsOf } from '@/api/payment'
import { QUERY_KEYS } from '@/api/keys'
import type { MerchantPaymentConfigItem, MerchantPaymentSwitchStatus } from '@/api/types/payment'
import {
  MERCHANT_PAYMENT_STATUS_DICT,
  PAYMENT_CHANNEL_DICT,
  canAuditMerchantPayment,
  canDisableMerchantPayment,
  canEnableMerchantPayment,
  dictLabel,
} from '@/constants/dictionary'
import { formatPercent } from '@/utils/format'
import StatusTag from '@/components/common/StatusTag.vue'
import TimeText from '@/components/common/TimeText.vue'

/**
 * 商户支付进件资料抽屉：列表接口只返回已提交的进件记录，所以这里额外拉一次
 * /merchant/{id} 的全渠道合成视图，未申请的渠道也能看到，平台才敢判断该给谁开哪条通道。
 * 结算账号只由后端下发脱敏值，抽屉本身不保存任何明文。
 */
const visible = defineModel<boolean>({ required: true })

const props = defineProps<{ record: MerchantPaymentConfigItem | null; busy?: boolean; canOperate?: boolean }>()

const emit = defineEmits<{
  (event: 'approve', row: MerchantPaymentConfigItem): void
  (event: 'reject', row: MerchantPaymentConfigItem): void
  (event: 'switch', row: MerchantPaymentConfigItem, status: MerchantPaymentSwitchStatus): void
}>()

const merchantId = computed(() => props.record?.merchantId ?? null)

const channelsQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.merchantPayment, 'channels', merchantId.value]),
  queryFn: () => fetchMerchantPaymentChannelsOf(merchantId.value as number),
  enabled: computed(() => merchantId.value !== null),
})
const channelRows = computed<MerchantPaymentConfigItem[]>(() => channelsQuery.data.value ?? [])

/**
 * props.record 是点击那一刻的列表快照，抽屉里直接审核或启停后它不会变，
 * 头部状态、审核人、意见就会停在旧值。这里用同一 query key 下的最新渠道行覆盖，
 * 商户身份字段仍以列表行为准（单商户视图不返回商户名）。
 */
const record = computed<MerchantPaymentConfigItem | null>(() => {
  const base = props.record
  if (!base) return null
  const fresh = channelRows.value.find((row) => row.channel === base.channel)
  if (!fresh) return base
  return {
    ...base,
    ...fresh,
    merchantName: base.merchantName ?? fresh.merchantName,
    merchantCode: base.merchantCode ?? fresh.merchantCode,
  }
})

const channelText = computed(() => record.value?.channelLabel || dictLabel(PAYMENT_CHANNEL_DICT, record.value?.channel))
const hasRecord = computed(() => record.value !== null && record.value.id !== null)

/** 合成视图不返回商户名，列表行里已有，直接沿用 */
const merchantTitle = computed(() => props.record?.merchantName ?? `商户 #${props.record?.merchantId ?? '-'}`)

/** 空值统一显示为「未提交」，避免审核人把空白误读成后端漏发 */
function textOf(value: string | null | undefined, empty = '未提交'): string {
  const text = value === null || value === undefined ? '' : value.trim()
  return text || empty
}

/** 三渠道合成视图不带商户身份，弹窗文案要靠它说明是哪个商户，补回列表行的值 */
function withMerchant(row: MerchantPaymentConfigItem): MerchantPaymentConfigItem {
  return {
    ...row,
    merchantName: row.merchantName ?? props.record?.merchantName,
    merchantCode: row.merchantCode ?? props.record?.merchantCode,
  }
}

function rateText(value: number | null): string {
  return formatPercent(value)
}
</script>

<template>
  <el-drawer v-model="visible" title="商户支付进件资料" size="720px" direction="rtl" destroy-on-close>
    <div v-if="record" class="payment-detail">
      <div class="payment-detail__head">
        <div class="payment-detail__title">
          <p class="payment-detail__name">{{ merchantTitle }}</p>
          <p class="table-sub-text table-mono">{{ record.merchantCode }} · 商户 ID {{ record.merchantId }}</p>
        </div>
        <div class="payment-detail__tags">
          <el-tag type="info" effect="plain" size="default">{{ channelText }}</el-tag>
          <StatusTag :item="MERCHANT_PAYMENT_STATUS_DICT[record.status]" size="default" />
        </div>
      </div>

      <el-alert
        v-if="!hasRecord"
        type="info"
        :closable="false"
        show-icon
        title="该商户尚未提交这条渠道的进件资料，下方字段均为空。"
        class="payment-detail__alert"
      />

      <h4 class="payment-detail__subtitle">渠道与结算</h4>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="支付渠道">{{ channelText }}</el-descriptions-item>
        <el-descriptions-item label="特约商户号">
          <span v-if="record.channelAccount" class="table-mono">{{ record.channelAccount }}</span>
          <span v-else class="text-muted">未提交</span>
        </el-descriptions-item>
        <el-descriptions-item label="渠道费率">
          <div class="cell-text">
            <span>{{ rateText(record.feeRate) }}</span>
            <p v-if="record.feeRate !== null" class="table-sub-text table-mono">{{ record.feeRate }}</p>
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="平台抽佣比例">
          <div class="cell-text">
            <span>{{ rateText(record.profitShareRate) }}</span>
            <p v-if="record.profitShareRate !== null" class="table-sub-text table-mono">{{ record.profitShareRate }}</p>
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="结算户名">{{ textOf(record.settleAccountName) }}</el-descriptions-item>
        <el-descriptions-item label="结算账号（已脱敏）">
          <span v-if="record.settleAccountNoMasked" class="table-mono">{{ record.settleAccountNoMasked }}</span>
          <span v-else class="text-muted">未提交</span>
        </el-descriptions-item>
      </el-descriptions>

      <h4 class="payment-detail__subtitle">该商户三渠道开通情况</h4>
      <el-table
        v-loading="channelsQuery.isFetching.value"
        :data="channelRows"
        border
        size="small"
        class="payment-detail__channels"
      >
        <el-table-column label="渠道" width="110">
          <template #default="{ row }: { row: MerchantPaymentConfigItem }">
            <div class="cell-text">
              <span>{{ row.channelLabel }}</span>
              <p class="table-sub-text table-mono">{{ row.channel }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="平台总开关" width="110" align="center">
          <template #default="{ row }: { row: MerchantPaymentConfigItem }">
            <el-tag :type="row.channelOpen ? 'success' : 'info'" effect="plain" size="small">
              {{ row.channelOpen ? '可收款' : '未就绪' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="商户状态" width="100" align="center">
          <template #default="{ row }: { row: MerchantPaymentConfigItem }">
            <StatusTag :item="MERCHANT_PAYMENT_STATUS_DICT[row.status]" />
          </template>
        </el-table-column>
        <el-table-column label="特约商户号" min-width="130">
          <template #default="{ row }: { row: MerchantPaymentConfigItem }">
            <span v-if="row.channelAccount" class="table-mono">{{ row.channelAccount }}</span>
            <span v-else class="text-muted">未提交</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" align="right">
          <template #default="{ row }: { row: MerchantPaymentConfigItem }">
            <template v-if="canOperate">
              <el-button v-if="canAuditMerchantPayment(row.status)" text type="success" :disabled="busy" @click="emit('approve', withMerchant(row))">
                通过
              </el-button>
              <el-button v-if="canAuditMerchantPayment(row.status)" text type="danger" :disabled="busy" @click="emit('reject', withMerchant(row))">
                驳回
              </el-button>
              <el-button v-if="canDisableMerchantPayment(row.status)" text type="danger" :disabled="busy" @click="emit('switch', withMerchant(row), 'disabled')">
                停用
              </el-button>
              <el-button v-if="canEnableMerchantPayment(row.status)" text type="success" :disabled="busy" @click="emit('switch', withMerchant(row), 'enabled')">
                启用
              </el-button>
            </template>
            <span v-if="row.id === null" class="text-muted payment-detail__none">未提交进件</span>
          </template>
        </el-table-column>
      </el-table>

      <h4 class="payment-detail__subtitle">进件主体</h4>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="营业执照号" :span="2">
          <span v-if="record.licenseNo" class="table-mono">{{ record.licenseNo }}</span>
          <span v-else class="text-muted">未提交</span>
        </el-descriptions-item>
        <el-descriptions-item label="联系人">{{ textOf(record.contactName) }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ textOf(record.contactPhone) }}</el-descriptions-item>
      </el-descriptions>

      <h4 class="payment-detail__subtitle">提交与审核</h4>
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="提交人">{{ textOf(record.appliedByName, '未提交') }}</el-descriptions-item>
        <el-descriptions-item label="提交时间">
          <TimeText :value="record.appliedAt" placeholder="未提交" />
        </el-descriptions-item>
        <el-descriptions-item label="审核人">{{ textOf(record.auditedByName, '未审核') }}</el-descriptions-item>
        <el-descriptions-item label="审核时间">
          <TimeText :value="record.auditedAt" placeholder="未审核" />
        </el-descriptions-item>
        <el-descriptions-item label="审核意见" :span="2">
          {{ textOf(record.auditRemark, '无') }}
        </el-descriptions-item>
        <el-descriptions-item label="最近更新" :span="2">
          <TimeText :value="record.updatedAt" />
        </el-descriptions-item>
      </el-descriptions>

      <p class="payment-detail__tip">
        审核意见为当前最新值，历史意见由操作审计记录承接；驳回后商户端可查看该意见并重新提交资料。
      </p>
    </div>

    <el-empty v-else description="未选择商户支付记录" :image-size="80" />
  </el-drawer>
</template>

<style scoped>
.payment-detail {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.payment-detail__head {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.payment-detail__title {
  min-width: 0;
}

.payment-detail__name {
  margin: 0 0 2px;
  font-size: 17px;
  font-weight: 600;
}

.payment-detail__tags {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  align-items: center;
}

.payment-detail__subtitle {
  margin: 16px 0 10px;
  font-size: 14px;
  font-weight: 600;
}

.payment-detail__channels {
  width: 100%;
}

.payment-detail__none {
  font-size: 12px;
}

.payment-detail__alert {
  margin-bottom: 16px;
}

.payment-detail__tip {
  margin: 14px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: #909399;
}

.payment-detail :deep(.el-descriptions) {
  margin-bottom: 4px;
}
</style>
