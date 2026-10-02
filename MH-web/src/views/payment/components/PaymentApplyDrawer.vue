<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'

import { applyPaymentConfig } from '@/api/payment'
import { QUERY_KEYS } from '@/api/keys'
import type { MerchantPaymentConfigItem, PaymentApplyInput, PaymentChannel } from '@/api/types/payment'
import { MERCHANT_PAYMENT_STATUS_DICT, PAYMENT_CHANNEL_DICT, dictLabel } from '@/constants/dictionary'
import { formatDateTime, formatRate } from '@/utils/format'
import {
  channelAccountRule,
  contactPhoneRule,
  licenseNoRule,
  requiredRule,
  settleAccountNoRule,
} from '@/utils/validate'
import StatusTag from '@/components/common/StatusTag.vue'

/**
 * 申请与修改共用一份表单模型。
 * 结算账号不从后端回填（只下发脱敏值），留空即沿用平台已登记的账号。
 */
interface PaymentApplyForm {
  channelAccount: string
  licenseNo: string
  settleAccountName: string
  settleAccountNo: string
  contactName: string
  contactPhone: string
}

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{
  config: MerchantPaymentConfigItem | null
  /** 只读模式用于查看待审核资料，不出现提交按钮 */
  readonly: boolean
}>()

const queryClient = useQueryClient()
const formRef = ref<FormInstance>()

const form = reactive<PaymentApplyForm>({
  channelAccount: '',
  licenseNo: '',
  settleAccountName: '',
  settleAccountNo: '',
  contactName: '',
  contactPhone: '',
})

const rules: FormRules<PaymentApplyForm> = {
  channelAccount: [requiredRule('请输入特约商户号'), channelAccountRule],
  licenseNo: [licenseNoRule],
  settleAccountNo: [settleAccountNoRule],
  contactPhone: [contactPhoneRule],
}

const channelName = computed<string>(() => {
  const config = props.config
  if (!config) return ''
  return config.channelLabel || dictLabel(PAYMENT_CHANNEL_DICT, config.channel)
})

const drawerTitle = computed<string>(() => {
  const config = props.config
  if (!config) return '收款进件申请'
  if (props.readonly) return `${channelName.value} · 申请资料`
  return config.status === 'not_applied' ? `申请开通 ${channelName.value}` : `修改 ${channelName.value} 资料`
})

/** 费率与抽佣由平台维护，这里只作只读展示 */
function platformRateText(value: number | null): string {
  if (value !== null) return formatRate(value)
  return '审核通过后由平台配置'
}

const needReaudit = computed<boolean>(() => props.config?.status === 'enabled')

function fillForm(): void {
  const config = props.config
  Object.assign(form, {
    channelAccount: config?.channelAccount ?? '',
    licenseNo: config?.licenseNo ?? '',
    settleAccountName: config?.settleAccountName ?? '',
    settleAccountNo: '',
    contactName: config?.contactName ?? '',
    contactPhone: config?.contactPhone ?? '',
  })
}

watch(
  () => [visible.value, props.config?.id] as const,
  ([open]) => {
    if (!open) return
    fillForm()
    formRef.value?.clearValidate()
  },
  { immediate: true },
)

const applyMutation = useMutation({
  mutationFn: (payload: PaymentApplyInput) => applyPaymentConfig(payload),
  onSuccess: () => {
    ElMessage.success('资料已提交，等待平台审核')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.paymentConfigs })
    visible.value = false
  },
})

function buildPayload(channel: PaymentChannel): PaymentApplyInput {
  const payload: PaymentApplyInput = {
    channel,
    channelAccount: form.channelAccount.trim(),
  }
  const licenseNo = form.licenseNo.trim()
  if (licenseNo) payload.licenseNo = licenseNo
  const settleAccountName = form.settleAccountName.trim()
  if (settleAccountName) payload.settleAccountName = settleAccountName
  const settleAccountNo = form.settleAccountNo.trim()
  if (settleAccountNo) payload.settleAccountNo = settleAccountNo
  const contactName = form.contactName.trim()
  if (contactName) payload.contactName = contactName
  const contactPhone = form.contactPhone.trim()
  if (contactPhone) payload.contactPhone = contactPhone
  return payload
}

/** 已开通渠道的资料修改会触发重新进件，提交前必须让商户确认 */
async function confirmReaudit(): Promise<boolean> {
  try {
    await ElMessageBox.confirm(
      '修改资料需平台重新审核，审核期间该渠道可能停用，确认提交？',
      '重新进件确认',
      { type: 'warning', confirmButtonText: '确认提交', cancelButtonText: '再想想' },
    )
    return true
  } catch {
    return false
  }
}

function handleSubmit(): void {
  const config = props.config
  if (!config) return
  formRef.value?.validate(async (valid) => {
    if (!valid) return
    if (needReaudit.value && !(await confirmReaudit())) return
    applyMutation.mutate(buildPayload(config.channel))
  })
}
</script>

<template>
  <el-drawer v-model="visible" :title="drawerTitle" size="620px" direction="rtl" :close-on-click-modal="false">
    <div class="payment-form">
      <el-alert
        v-if="needReaudit && !readonly"
        class="payment-form__tip"
        type="warning"
        :closable="false"
        show-icon
        title="该渠道已开通，修改资料后需平台重新审核，审核期间可能无法收款"
      />
      <el-alert
        v-else-if="config?.status === 'pending_audit'"
        class="payment-form__tip"
        type="info"
        :closable="false"
        show-icon
        title="资料已提交，等待平台审核，审核完成前不可修改"
      />

      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" :disabled="readonly">
        <el-divider content-position="left">渠道账户</el-divider>
        <el-form-item label="支付渠道">
          <span class="payment-form__static">{{ channelName || '--' }}</span>
          <StatusTag
            v-if="config"
            class="payment-form__status"
            :item="MERCHANT_PAYMENT_STATUS_DICT[config.status]"
          />
        </el-form-item>
        <el-form-item label="特约商户号" prop="channelAccount">
          <el-input
            v-model="form.channelAccount"
            maxlength="32"
            :placeholder="config?.channel === 'alipay' ? '支付宝 partner id' : '微信支付特约商户号 sub_mchid'"
          />
          <span class="payment-form__hint">2-32 位字母或数字，由商户在渠道方开通后取得</span>
        </el-form-item>
        <el-form-item label="营业执照号" prop="licenseNo">
          <el-input v-model="form.licenseNo" maxlength="18" placeholder="18 位统一社会信用代码，可留空" />
        </el-form-item>

        <el-divider content-position="left">结算与联系</el-divider>
        <el-form-item label="结算户名" prop="settleAccountName">
          <el-input v-model="form.settleAccountName" maxlength="30" placeholder="与结算银行卡一致，可留空" />
        </el-form-item>
        <el-form-item label="结算账号" prop="settleAccountNo">
          <span v-if="readonly" class="payment-form__static">{{ config?.settleAccountNoMasked || '未填写' }}</span>
          <el-input v-else v-model="form.settleAccountNo" maxlength="30" placeholder="12-30 位数字，可留空" />
          <span v-if="!readonly" class="payment-form__hint">
            出于安全考虑不回显完整账号；留空表示沿用 {{ config?.settleAccountNoMasked ? '原账号' : '审核时登记的账号' }}
          </span>
        </el-form-item>
        <el-form-item label="联系人" prop="contactName">
          <el-input v-model="form.contactName" maxlength="20" placeholder="对接进件审核的负责人，可留空" />
        </el-form-item>
        <el-form-item label="联系电话" prop="contactPhone">
          <el-input v-model="form.contactPhone" maxlength="20" placeholder="手机号或带区号座机号，可留空" />
        </el-form-item>

        <el-divider content-position="left">平台配置（只读）</el-divider>
        <el-form-item label="渠道费率">
          <span class="payment-form__static">{{ platformRateText(config?.feeRate ?? null) }}</span>
        </el-form-item>
        <el-form-item label="平台抽佣">
          <span class="payment-form__static">{{ platformRateText(config?.profitShareRate ?? null) }}</span>
        </el-form-item>

        <template v-if="readonly && config">
          <el-divider content-position="left">审核记录</el-divider>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="提交信息">
              {{ config.appliedByName || '—' }} {{ config.appliedAt ? formatDateTime(config.appliedAt) : '未提交' }}
            </el-descriptions-item>
            <el-descriptions-item label="审核信息">
              {{ config.auditedByName || '—' }} {{ config.auditedAt ? formatDateTime(config.auditedAt) : '未审核' }}
            </el-descriptions-item>
            <el-descriptions-item label="驳回原因">
              <span :class="config.auditRemark ? 'payment-form__remark' : ''">
                {{ config.auditRemark || '无' }}
              </span>
            </el-descriptions-item>
          </el-descriptions>
        </template>
      </el-form>
    </div>

    <template #footer>
      <el-space>
        <el-button @click="visible = false">{{ readonly ? '关闭' : '取消' }}</el-button>
        <el-button
          v-if="!readonly"
          type="primary"
          :loading="applyMutation.isPending.value"
          :disabled="!config"
          @click="handleSubmit"
        >
          {{ needReaudit ? '提交并重新审核' : '提交申请' }}
        </el-button>
      </el-space>
    </template>
  </el-drawer>
</template>

<style scoped>
.payment-form__tip {
  margin-bottom: 12px;
}

.payment-form__static {
  color: #303133;
}

.payment-form__status {
  margin-left: 10px;
}

.payment-form__hint {
  margin-left: 10px;
  font-size: 12px;
  color: #909399;
}

.payment-form__remark {
  font-weight: 500;
  color: #f56c6c;
}
</style>
