<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'

import { updatePaymentChannel } from '@/api/payment'
import { QUERY_KEYS } from '@/api/keys'
import type { PaymentChannel, PaymentChannelItem, PaymentChannelUpdateInput, PaymentSecretField } from '@/api/types/payment'
import { PAYMENT_SECRET_MASK } from '@/constants/api'
import { paymentFieldLabel } from '@/constants/dictionary'
import { notifyUrlRule } from '@/utils/validate'

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{ record: PaymentChannelItem | null }>()

const queryClient = useQueryClient()
const formRef = ref<FormInstance>()

const form = reactive({
  enabled: false,
  notifyUrl: '',
  appId: '',
  mchId: '',
  sandbox: false,
})

/**
 * 密钥输入值：字段名 -> 当前输入。
 * 打开对话框时用后端下发的掩码（已配置）或空串（未配置）初始化，
 * 用户不动它就等于「保持原值」，绝不会被当成真实密钥提交。
 */
const secretValues = reactive<Record<string, string>>({})

const isWechat = computed(() => props.record?.channel === 'wechat')
const isAlipay = computed(() => props.record?.channel === 'alipay')
const isMock = computed(() => props.record?.channel === 'mock')
const secretFields = computed<PaymentSecretField[]>(() => props.record?.secretFields ?? [])
const dialogTitle = computed(() => (props.record ? `配置「${props.record.label}」` : '配置支付渠道'))

const appIdLabel = computed(() => (isWechat.value ? '服务商 AppID' : '应用 AppID'))
const appIdPlaceholder = computed(() => (isWechat.value ? '如 wx1a2b3c4d5e6f7a8b' : '如 2021000123456789'))
const notifyUrlPlaceholder = computed(() =>
  isWechat.value
    ? 'https://api.example.com/api/v1/pay/notify/wechat'
    : 'https://api.example.com/api/v1/pay/notify/alipay',
)

const rules = computed<FormRules<typeof form>>(() => ({
  notifyUrl: [notifyUrlRule],
}))

/** 输入值与初始掩码不同即为「本次要改动」；等于掩码常量同样视为未改动 */
function isSecretDirty(field: PaymentSecretField): boolean {
  const value = secretValues[field.name] ?? ''
  return value !== field.masked && value !== PAYMENT_SECRET_MASK
}

/** 原本已配置、这次被清空 —— 契约里这是「删除该密钥」的显式动作 */
function isSecretCleared(field: PaymentSecretField): boolean {
  return field.configured && (secretValues[field.name] ?? '') === ''
}

const secretChanges = computed(() => {
  const updated: string[] = []
  const cleared: string[] = []
  for (const field of secretFields.value) {
    if (!isSecretDirty(field)) continue
    if (isSecretCleared(field)) cleared.push(field.label)
    else updated.push(field.label)
  }
  return { updated, cleared }
})

const secretChangeText = computed(() => {
  const { updated, cleared } = secretChanges.value
  if (updated.length === 0 && cleared.length === 0) {
    return secretFields.value.length > 0 ? '密钥全部保持不变，保存后沿用原值' : '该渠道无需配置密钥'
  }
  const parts: string[] = []
  if (updated.length > 0) parts.push(`将覆盖：${updated.join('、')}`)
  if (cleared.length > 0) parts.push(`将清除：${cleared.join('、')}`)
  return parts.join('；')
})

/** 只提交真正改动过的密钥：未改动的字段直接不出现在请求体里 */
function buildSecrets(): Record<string, string> | undefined {
  const secrets: Record<string, string> = {}
  for (const field of secretFields.value) {
    if (!isSecretDirty(field)) continue
    const value = (secretValues[field.name] ?? '').trim()
    secrets[field.name] = field.configured && value === '' ? '' : value
  }
  return Object.keys(secrets).length > 0 ? secrets : undefined
}

function buildInput(): PaymentChannelUpdateInput {
  const input: PaymentChannelUpdateInput = { enabled: form.enabled }
  if (!isMock.value) {
    // 空串一律转 null：后端把 null 当作「未配置」，回落 .env 的值由服务端决定
    input.notifyUrl = form.notifyUrl.trim() || null
    input.appId = form.appId.trim() || null
    if (isWechat.value) input.mchId = form.mchId.trim() || null
    if (isAlipay.value) input.sandbox = form.sandbox
  }
  const secrets = buildSecrets()
  if (secrets) input.secrets = secrets
  return input
}

const saveMutation = useMutation({
  mutationFn: (variables: { channel: PaymentChannel; input: PaymentChannelUpdateInput }) =>
    updatePaymentChannel(variables.channel, variables.input),
  onSuccess: (data) => {
    ElMessage.success(`「${data.label}」配置已保存`)
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.paymentChannels })
    visible.value = false
  },
})

watch(
  () => [visible.value, props.record] as const,
  ([open, record]) => {
    if (!open || !record) return
    Object.assign(form, {
      enabled: record.enabled,
      notifyUrl: record.notifyUrl ?? '',
      appId: record.appId ?? '',
      mchId: record.mchId ?? '',
      sandbox: record.sandbox ?? false,
    })
    for (const key of Object.keys(secretValues)) delete secretValues[key]
    for (const field of record.secretFields) {
      secretValues[field.name] = field.configured ? field.masked : ''
    }
    formRef.value?.clearValidate()
  },
  { immediate: true },
)

async function handleSubmit(): Promise<void> {
  const record = props.record
  if (!record) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  // 清除密钥会让渠道立刻失去下单能力，属于危险操作，必须二次确认
  if (secretChanges.value.cleared.length > 0) {
    try {
      await ElMessageBox.confirm(
        `即将清除「${record.label}」的 ${secretChanges.value.cleared.join('、')}，清除后该渠道将无法下单，直到重新配置密钥。`,
        '确认清除密钥',
        { type: 'warning', confirmButtonText: '确认清除', cancelButtonText: '再想想' },
      )
    } catch {
      return
    }
  }
  saveMutation.mutate({ channel: record.channel, input: buildInput() })
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="680px"
    top="6vh"
    :close-on-click-modal="false"
    @closed="formRef?.clearValidate()"
  >
    <el-alert
      v-if="record && !record.ready && !isMock"
      type="warning"
      :closable="false"
      show-icon
      title="该渠道凭据不全，当前无法下单"
      class="dialog-alert"
    >
      <template #default>
        <el-space wrap :size="6">
          <span class="dialog-alert__label">缺失字段：</span>
          <el-tag v-for="field in record.missingFields" :key="field" type="danger" size="small" effect="plain">
            {{ paymentFieldLabel(field, secretFields) }}
          </el-tag>
        </el-space>
      </template>
    </el-alert>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="118px">
      <el-form-item label="平台总开关">
        <el-switch v-model="form.enabled" active-text="开启" inactive-text="关闭" inline-prompt />
        <span class="dialog-tip">关闭后所有商户都无法使用该支付方式。</span>
      </el-form-item>

      <template v-if="!isMock">
        <el-form-item label="支付通知地址" prop="notifyUrl">
          <el-input v-model="form.notifyUrl" clearable :placeholder="notifyUrlPlaceholder" />
          <p class="table-sub-text">必须是公网可访问的 http(s) 地址，留空表示不下发自定义回调。</p>
        </el-form-item>
        <el-form-item :label="appIdLabel">
          <el-input v-model="form.appId" clearable maxlength="64" :placeholder="appIdPlaceholder" />
        </el-form-item>
        <el-form-item v-if="isWechat" label="服务商商户号">
          <el-input v-model="form.mchId" clearable maxlength="32" placeholder="如 1688888888" />
        </el-form-item>
        <el-form-item v-if="isAlipay" label="沙箱环境">
          <el-switch v-model="form.sandbox" />
          <span class="dialog-tip">开启后走支付宝开放平台沙箱网关，仅用于联调。</span>
        </el-form-item>

        <el-divider content-position="left">密钥</el-divider>
        <el-form-item v-for="field in secretFields" :key="field.name" :label="field.label">
          <el-input
            v-model="secretValues[field.name]"
            type="textarea"
            :rows="3"
            placeholder="不修改则保持原值；清空并保存即删除该密钥"
          />
          <p class="secret-meta">
            <el-tag v-if="!isSecretDirty(field)" type="info" size="small" effect="plain">
              {{ field.configured ? '保持不变' : '未配置' }}
            </el-tag>
            <el-tag v-else :type="isSecretCleared(field) ? 'danger' : 'warning'" size="small" effect="plain">
              {{ isSecretCleared(field) ? '保存后清除' : '保存后覆盖为新值' }}
            </el-tag>
            <template v-if="field.configured">
              <el-tag type="success" size="small" effect="plain">已配置</el-tag>
              <span class="secret-meta__mono">{{ field.masked }}</span>
              <span class="text-muted">指纹 {{ field.fingerprint || '--' }}</span>
            </template>
          </p>
        </el-form-item>
        <p v-if="secretFields.length === 0" class="table-sub-text dialog-secret-empty">该渠道无需配置密钥。</p>
      </template>
      <el-alert
        v-else
        type="info"
        :closable="false"
        show-icon
        title="模拟支付不请求真实网关，仅用于本地联调与流程演示，无需密钥与回调地址。"
        class="dialog-alert"
      />
    </el-form>

    <p v-if="!isMock" class="dialog-summary">{{ secretChangeText }}</p>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saveMutation.isPending.value" @click="handleSubmit">保存配置</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.dialog-alert {
  margin-bottom: 14px;
}

.dialog-alert__label {
  font-size: 12px;
  color: #606266;
}

.dialog-tip {
  margin-left: 10px;
  font-size: 12px;
  color: #909399;
}

.secret-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 4px 0 0;
  font-size: 12px;
}

.secret-meta__mono {
  font-family: 'JetBrains Mono', Consolas, monospace;
  color: #67c23a;
}

.dialog-secret-empty {
  margin: -6px 0 4px 118px;
}

.dialog-summary {
  margin: 4px 0 0;
  padding: 8px 10px;
  font-size: 12px;
  color: #606266;
  background: #f8fafd;
  border-radius: 6px;
}
</style>
