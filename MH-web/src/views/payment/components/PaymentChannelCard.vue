<script setup lang="ts">
import { computed } from 'vue'
import { CirclePlus, CreditCard, EditPen, Money, Coin, View } from '@element-plus/icons-vue'

import type { Component } from 'vue'
import type { MerchantPaymentConfigItem, PaymentChannel } from '@/api/types/payment'
import { MERCHANT_PAYMENT_STATUS_DICT, PAYMENT_CHANNEL_DICT, dictLabel } from '@/constants/dictionary'
import { formatDateTime, formatRate } from '@/utils/format'
import StatusTag from '@/components/common/StatusTag.vue'

interface InfoRow {
  label: string
  value: string
}

/** 平台未开放渠道时的统一提示 */
const CHANNEL_CLOSED_TIP = '平台未开放该渠道，请联系运营'

const CHANNEL_ICON_MAP: Record<PaymentChannel, Component> = {
  wechat: Money,
  alipay: CreditCard,
  mock: Coin,
}

const ACCOUNT_LABEL_MAP: Record<PaymentChannel, string> = {
  wechat: '特约商户号',
  alipay: '支付宝商户号',
  mock: '模拟商户号',
}

const props = defineProps<{
  config: MerchantPaymentConfigItem
  /** 当前账号是否有 payment:apply，收银员只有查看权限 */
  canApply: boolean
}>()

const emit = defineEmits<{
  /** 打开可编辑的申请/修改抽屉 */
  apply: [config: MerchantPaymentConfigItem]
  /** 打开只读的资料抽屉 */
  view: [config: MerchantPaymentConfigItem]
}>()

const channelIcon = computed<Component>(() => CHANNEL_ICON_MAP[props.config.channel])
const accountLabel = computed<string>(() => ACCOUNT_LABEL_MAP[props.config.channel])
const channelName = computed<string>(
  () => props.config.channelLabel || dictLabel(PAYMENT_CHANNEL_DICT, props.config.channel),
)

/** 已提交过资料的渠道才回看得见内容 */
const hasSubmitted = computed<boolean>(() => props.config.status !== 'not_applied')

/** 平台关闭渠道时禁止任何申请与修改动作 */
const applyBlocked = computed<boolean>(() => !props.config.channelOpen)
const canSubmit = computed<boolean>(() => props.canApply && !applyBlocked.value)

const applyActionLabel = computed<string>(() => {
  switch (props.config.status) {
    case 'not_applied':
      return '申请开通'
    case 'rejected':
      return '修改重新提交'
    case 'disabled':
      return '重新提交申请'
    default:
      return '修改资料'
  }
})

const applyActionIcon = computed<Component>(() => (props.config.status === 'not_applied' ? CirclePlus : EditPen))

/** 空串表示该信息对当前状态无意义，模板里整行隐藏 */
function rateText(value: number | null): string {
  if (value !== null) return formatRate(value)
  return hasSubmitted.value ? '平台未配置' : ''
}

function settleText(name: string | null, masked: string | null): string {
  if (!masked && !name) return hasSubmitted.value ? '未填写' : ''
  return [name, masked].filter((part): part is string => Boolean(part)).join(' ')
}

function personText(name: string | null, time: string | null, suffix: string): string {
  if (!time) return name ? `${name}${suffix}` : ''
  return `${name ?? '—'} ${formatDateTime(time)}${suffix}`
}

const infoRows = computed<InfoRow[]>(() => {
  const config = props.config
  const rows: InfoRow[] = [
    { label: accountLabel.value, value: config.channelAccount || '待提交' },
    { label: '渠道费率', value: rateText(config.feeRate) },
    { label: '平台抽佣', value: rateText(config.profitShareRate) },
    { label: '结算账户', value: settleText(config.settleAccountName, config.settleAccountNoMasked) },
    { label: '提交信息', value: personText(config.appliedByName, config.appliedAt, ' 提交') },
    { label: '审核信息', value: personText(config.auditedByName, config.auditedAt, ' 审核') },
    { label: '联系人', value: [config.contactName, config.contactPhone].filter(Boolean).join(' · ') },
  ]
  return rows.filter((row) => row.value !== '')
})

const rejectRemark = computed<string>(() => {
  const config = props.config
  if (config.status !== 'rejected') return ''
  return config.auditRemark || '平台未填写驳回原因，请联系运营确认'
})
</script>

<template>
  <el-card class="channel-card" shadow="never">
    <template #header>
      <div class="channel-card__head">
        <span class="channel-card__name">
          <el-icon :size="18"><component :is="channelIcon" /></el-icon>
          <span>{{ channelName }}</span>
        </span>
        <StatusTag :item="MERCHANT_PAYMENT_STATUS_DICT[config.status]" />
      </div>
    </template>

    <el-alert
      v-if="rejectRemark"
      class="channel-card__tip"
      type="error"
      :closable="false"
      show-icon
      title="驳回原因"
    >
      <template #default>
        <span class="channel-card__remark">{{ rejectRemark }}</span>
      </template>
    </el-alert>
    <el-alert
      v-else-if="config.status === 'disabled'"
      class="channel-card__tip"
      type="warning"
      :closable="false"
      show-icon
      title="该渠道已被平台停用，请联系运营处理"
    />
    <el-alert
      v-else-if="config.status === 'pending_audit'"
      class="channel-card__tip"
      type="info"
      :closable="false"
      show-icon
      title="资料已提交，等待平台审核"
    />

    <dl class="channel-card__info">
      <div v-for="row in infoRows" :key="row.label" class="channel-card__row">
        <dt>{{ row.label }}</dt>
        <dd class="text-ellipsis" :title="row.value">{{ row.value }}</dd>
      </div>
      <p v-if="infoRows.length === 0" class="text-muted">提交特约商户号等资料后可开通该渠道</p>
    </dl>

    <div class="channel-card__actions">
      <el-button v-if="config.status === 'pending_audit'" plain @click="emit('view', config)">
        <el-icon><View /></el-icon>
        <span>查看资料</span>
      </el-button>

      <template v-else-if="canApply">
        <el-button v-if="canSubmit" type="primary" @click="emit('apply', config)">
          <el-icon><component :is="applyActionIcon" /></el-icon>
          <span>{{ applyActionLabel }}</span>
        </el-button>
        <el-tooltip v-else :content="CHANNEL_CLOSED_TIP" placement="top">
          <span class="channel-card__wrap">
            <el-button type="primary" disabled>
              <el-icon><component :is="applyActionIcon" /></el-icon>
              <span>{{ applyActionLabel }}</span>
            </el-button>
          </span>
        </el-tooltip>
      </template>

      <el-button v-else-if="hasSubmitted" plain @click="emit('view', config)">
        <el-icon><View /></el-icon>
        <span>查看资料</span>
      </el-button>
    </div>
  </el-card>
</template>

<style scoped>
.channel-card {
  height: 100%;
  border: 1px solid #e8ecf4;
}

.channel-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.channel-card__name {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}

.channel-card__tip {
  margin-bottom: 12px;
}

.channel-card__remark {
  font-weight: 500;
  line-height: 1.6;
}

.channel-card__info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
}

.channel-card__row {
  display: flex;
  gap: 8px;
  align-items: baseline;
  min-width: 0;
}

.channel-card__row dt {
  flex-shrink: 0;
  width: 84px;
  font-size: 12px;
  color: #909399;
}

.channel-card__row dd {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: #303133;
}

.channel-card__actions {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px dashed #eef1f6;
}

.channel-card__wrap {
  display: inline-flex;
}
</style>
