<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'

import { updatePrintProvider } from '@/api/print-provider'
import { QUERY_KEYS } from '@/api/keys'
import type {
  PrintProvider,
  PrintProviderItem,
  PrintProviderUpdateInput,
  PrintSecretField,
} from '@/api/types/print-provider'
import { PAYMENT_SECRET_MASK } from '@/constants/api'
import { printProviderFieldLabel } from '@/constants/dictionary'

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{ record: PrintProviderItem | null }>()

const queryClient = useQueryClient()
const formRef = ref<FormInstance>()

const form = reactive({
  enabled: false,
  account: '',
  baseUrl: '',
})

/**
 * 密钥输入值：字段名 -> 当前输入。
 * 打开对话框时用后端下发的掩码（已配置）或空串（未配置）初始化，
 * 用户不动它就等于「保持原值」，绝不会被当成真实密钥提交。
 */
const secretValues = reactive<Record<string, string>>({})

const secretFields = computed<PrintSecretField[]>(() => props.record?.secretFields ?? [])
const isFeie = computed(() => props.record?.provider === 'feie')
const dialogTitle = computed(() => (props.record ? `配置「${props.record.label}」` : '配置云打印机厂商'))

const accountLabel = computed(() => (isFeie.value ? '飞鹅账号 user' : '应用 client_id'))
const accountPlaceholder = computed(() =>
  isFeie.value
    ? '飞鹅云后台的登录用户名，一般是注册邮箱；不是 UUID 也不是数字 ID'
    : '易联云开放平台的 client_id',
)

const rules: FormRules<typeof form> = {
  account: [
    {
      validator: (_rule, value: string, callback) => {
        // 账号不是密钥，但填错了自检一定失败，这里挡掉明显的手误
        const trimmed = (value ?? '').trim()
        if (trimmed && /\s/.test(trimmed)) {
          callback(new Error('账号不能包含空格'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}

/** 输入值与初始掩码不同即为「本次要改动」；等于掩码常量同样视为未改动 */
function isSecretDirty(field: PrintSecretField): boolean {
  const value = secretValues[field.name] ?? ''
  return value !== field.masked && value !== PAYMENT_SECRET_MASK
}

/** 原本已配置、这次被清空 —— 契约里这是「删除该密钥」的显式动作 */
function isSecretCleared(field: PrintSecretField): boolean {
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
    return secretFields.value.length > 0 ? '密钥全部保持不变，保存后沿用原值' : '该厂商无需配置密钥'
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

function buildInput(provider: PrintProvider): PrintProviderUpdateInput {
  const input: PrintProviderUpdateInput = {
    enabled: form.enabled,
    // 空串一律转 null：后端把 null 当作「未配置」，回落 .env 由服务端决定
    baseUrl: form.baseUrl.trim() || null,
  }
  if (provider === 'feie') input.uid = form.account.trim() || null
  else input.clientId = form.account.trim() || null

  const secrets = buildSecrets()
  if (secrets) input.secrets = secrets
  return input
}

const saveMutation = useMutation({
  mutationFn: (variables: { provider: PrintProvider; input: PrintProviderUpdateInput }) =>
    updatePrintProvider(variables.provider, variables.input),
  onSuccess: (data) => {
    ElMessage.success(`「${data.label}」配置已保存`)
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.printProviders })
    visible.value = false
  },
})

watch(
  () => [visible.value, props.record] as const,
  ([open, record]) => {
    if (!open || !record) return
    Object.assign(form, {
      enabled: record.enabled,
      account: record.account ?? '',
      baseUrl: record.baseUrl ?? '',
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

  // 清除密钥等同于把该厂商停掉，属于危险操作，必须二次确认
  if (secretChanges.value.cleared.length > 0) {
    try {
      await ElMessageBox.confirm(
        `即将清除「${record.label}」的 ${secretChanges.value.cleared.join('、')}，清除后该厂商的云打印机将无法出纸，直到重新配置密钥。`,
        '确认清除密钥',
        { type: 'warning', confirmButtonText: '确认清除', cancelButtonText: '再想想' },
      )
    } catch {
      return
    }
  }
  saveMutation.mutate({ provider: record.provider, input: buildInput(record.provider) })
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="640px"
    top="6vh"
    :close-on-click-modal="false"
    @closed="formRef?.clearValidate()"
  >
    <el-alert
      v-if="record && !record.configured"
      type="warning"
      :closable="false"
      show-icon
      title="该厂商凭据不全，对应品牌的云打印机当前无法出纸"
      class="dialog-alert"
    >
      <template #default>
        <el-space wrap :size="6">
          <span class="dialog-alert__label">缺失字段：</span>
          <el-tag
            v-for="field in record.missingFields"
            :key="field"
            type="danger"
            size="small"
            effect="plain"
          >
            {{ printProviderFieldLabel(field, secretFields) }}
          </el-tag>
        </el-space>
      </template>
    </el-alert>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="128px">
      <el-form-item label="平台总开关">
        <el-switch v-model="form.enabled" active-text="开启" inactive-text="关闭" inline-prompt />
        <span class="dialog-tip">关闭后所有商户的该厂商云打印机都无法出纸。</span>
      </el-form-item>

      <el-form-item :label="accountLabel" prop="account">
        <el-input v-model="form.account" clearable maxlength="64" :placeholder="accountPlaceholder" />
        <p v-if="isFeie" class="table-sub-text">
          在飞鹅开发者后台 developer.de.feieyun.com 登录后，「个人中心」里同时写着这个登录账号（user）
          和 UKEY（下面填）。飞鹅没有 UUID 这种东西，别拿一串随机字符来填。
          另外打印机必须先绑定到这个账号下（后台添加机身 SN + 校验码），否则凭据全对也会回「设备不存在」。
        </p>
        <p class="table-sub-text">
          账号类字段是明文：泄露只说明「你是谁」，不能冒充你出纸，所以这里可以正常回填。
        </p>
      </el-form-item>

      <el-form-item label="网关地址">
        <el-input v-model="form.baseUrl" clearable maxlength="255" placeholder="留空使用官方地址" />
        <p class="table-sub-text">
          仅联调沙箱或自建代理时需要改；留空即用官方地址，避免升级后指向过期域名。
        </p>
      </el-form-item>

      <el-divider content-position="left">密钥</el-divider>
      <el-form-item v-for="field in secretFields" :key="field.name" :label="field.label">
        <el-input
          v-model="secretValues[field.name]"
          type="password"
          show-password
          placeholder="不修改则保持原值；清空并保存即删除该密钥"
        />
        <p class="secret-meta">
          <el-tag v-if="!isSecretDirty(field)" type="info" size="small" effect="plain">
            {{ field.configured ? '保持不变' : '未配置' }}
          </el-tag>
          <el-tag
            v-else
            :type="isSecretCleared(field) ? 'danger' : 'warning'"
            size="small"
            effect="plain"
          >
            {{ isSecretCleared(field) ? '保存后清除' : '保存后覆盖为新值' }}
          </el-tag>
          <template v-if="field.configured">
            <el-tag type="success" size="small" effect="plain">已配置</el-tag>
            <span class="secret-meta__mono">{{ field.masked }}</span>
            <span class="text-muted">指纹 {{ field.fingerprint || '--' }}</span>
          </template>
        </p>
      </el-form-item>
      <p v-if="secretFields.length === 0" class="table-sub-text dialog-secret-empty">
        该厂商无需配置密钥。
      </p>
    </el-form>

    <p class="dialog-summary">{{ secretChangeText }}</p>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saveMutation.isPending.value" @click="handleSubmit">
        保存配置
      </el-button>
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
  margin: -6px 0 4px 128px;
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
