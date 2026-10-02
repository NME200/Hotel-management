<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Check, CircleClose, Connection, Refresh, Warning } from '@element-plus/icons-vue'

import { fetchMiniProgramConfig, testMiniProgramConfig, updateMiniProgramConfig } from '@/api/mini-program'
import { QUERY_KEYS } from '@/api/keys'
import type {
  MiniProgramConfigUpdateInput,
  MiniProgramConfigView,
  MiniProgramConnectivityResult,
} from '@/api/types/mini-program'
import { PAYMENT_SECRET_MASK } from '@/constants/api'
import { MINI_PROGRAM_CONFIG_SOURCE_DICT, MINI_PROGRAM_SOURCE_HINT } from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { miniAppIdRule, requiredRule } from '@/utils/validate'
import { useAuthStore } from '@/stores/auth'
import StatusTag from '@/components/common/StatusTag.vue'
import TimeText from '@/components/common/TimeText.vue'

/** 密钥本次提交要做的动作：与后端 appSecret 的三态语义一一对应 */
type SecretAction = 'keep' | 'overwrite' | 'clear'

const authStore = useAuthStore()
const queryClient = useQueryClient()

/** 页面路由已由 platform:mini-program:manage 守卫，这里再按权限点控住写操作，避免后端后续放权时改代码 */
const canManage = computed(() => authStore.can(PERMISSION.miniProgramManage))

const configQuery = useQuery({
  queryKey: QUERY_KEYS.miniProgramConfig,
  queryFn: () => fetchMiniProgramConfig(),
  enabled: canManage,
})

/** 后端下发的当前生效配置，未加载完成时为 null */
const config = computed<MiniProgramConfigView | null>(() => configQuery.data.value ?? null)

const formRef = ref<FormInstance>()
const form = reactive({
  appId: '',
  loginEnabled: true,
})

/**
 * AppSecret 输入值：已配置时回填后端掩码，未配置时为空。
 * 明文永远不会从接口下来，这里能显示的最多就是 ********。
 */
const secretInput = ref('')

/** 用户显式点了「清空密钥」——只有这种情形才把空串提交给后端，单纯留空不等于清除 */
const clearSecretRequested = ref(false)

const rules = computed<FormRules<typeof form>>(() => ({
  appId: [requiredRule('请输入小程序 AppID'), miniAppIdRule],
}))

/**
 * 是否真的输入了新密钥（secretDirty）：空串是「沿用原值」，等于掩码是「没动占位符」，都不算改动。
 * 后端把掩码同样视为不修改，但前端在「未改动」时直接不下发 appSecret 这个 key。
 */
const secretDirty = computed(() => {
  const value = secretInput.value.trim()
  if (!value || value === PAYMENT_SECRET_MASK) return false
  return value !== (config.value?.secretMasked ?? '')
})

const secretAction = computed<SecretAction>(() => {
  if (secretDirty.value) return 'overwrite'
  return clearSecretRequested.value ? 'clear' : 'keep'
})

const secretActionLabel = computed(() => {
  if (secretAction.value === 'overwrite') return '已修改，将覆盖原密钥'
  if (secretAction.value === 'clear') return '已标记清空，保存后删除'
  return config.value?.secretConfigured ? '保持不变' : '未配置'
})

const secretActionTag = computed<'info' | 'warning' | 'danger'>(() => {
  if (secretAction.value === 'overwrite') return 'warning'
  return secretAction.value === 'clear' ? 'danger' : 'info'
})

/** 输入框占位：已配置时展示掩码并说明「留空即不修改」，未配置时才提示去录入 */
const secretPlaceholder = computed(() =>
  config.value?.secretConfigured
    ? `${PAYMENT_SECRET_MASK} 已配置，留空或保持掩码表示不修改`
    : '尚未配置，请填写小程序 AppSecret',
)

/** 密钥改动的行内摘要，语义对齐支付渠道配置对话框的「密钥变更摘要」 */
const secretSummary = computed(() => {
  const fingerprint = config.value?.secretFingerprint ?? '--'
  if (secretAction.value === 'overwrite') {
    return `保存后覆盖原密钥，改前指纹 ${fingerprint}，保存后可在此比对改后指纹`
  }
  if (secretAction.value === 'clear') {
    return '保存后删除已存密钥，顾客将无法换取 openid'
  }
  return config.value?.secretConfigured
    ? `沿用原密钥，当前指纹 ${fingerprint}`
    : '未配置，请填写并与微信公众平台一致'
})

/** 表单是否有未保存的改动，用于提醒「自检读的是已保存配置」 */
const hasDraft = computed(() => {
  const current = config.value
  if (!current) return false
  return (
    form.appId.trim() !== (current.appId ?? '') ||
    form.loginEnabled !== current.loginEnabled ||
    secretAction.value !== 'keep'
  )
})

/** 缺失字段的可读列表：后端直接下发可读名（AppID / AppSecret） */
const missingFields = computed(() => config.value?.missingFields ?? [])

/** 自检结果只服务当前这一次操作，放本地状态，不进 Query 缓存 */
const testResult = ref<MiniProgramConnectivityResult | null>(null)

/**
 * 用后端视图回填表单。
 * 依赖 Query 数据刷新是安全的：本页没有列表轮询，refetch 都由运营主动触发；
 * 密钥框永远留空（掩码只做占位提示），界面上不残留任何一次输入过的明文。
 */
function syncForm(view: MiniProgramConfigView | null | undefined): void {
  if (!view) return
  Object.assign(form, {
    appId: view.appId ?? '',
    loginEnabled: view.loginEnabled,
  })
  secretInput.value = ''
  clearSecretRequested.value = false
  formRef.value?.clearValidate()
}

watch(() => configQuery.data.value, syncForm, { immediate: true })

/** 重新输入即撤销「清空」意图，避免两个互斥动作同时生效 */
watch(secretInput, (value) => {
  const text = value.trim()
  if (text && text !== PAYMENT_SECRET_MASK) clearSecretRequested.value = false
})

/**
 * 只提交真正改动过的密钥：
 * keep 时 appSecret 这个 key 压根不出现在请求体里（后端把 undefined 视为不修改），
 * 传空串会让后端真的清空密钥，只有点过「清空密钥」才走这一支。
 */
function buildInput(): MiniProgramConfigUpdateInput {
  const input: MiniProgramConfigUpdateInput = {
    appId: form.appId.trim(),
    loginEnabled: form.loginEnabled,
  }
  const action = secretAction.value
  if (action === 'overwrite') input.appSecret = secretInput.value.trim()
  if (action === 'clear') input.appSecret = ''
  return input
}

const saveMutation = useMutation({
  mutationFn: (variables: { input: MiniProgramConfigUpdateInput; beforeFingerprint: string | null }) =>
    updateMiniProgramConfig(variables.input),
  onSuccess: (view, variables) => {
    syncForm(view)
    notifySaved(view, variables.beforeFingerprint)
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.miniProgramConfig })
  },
})

/** 保存后的提示要点：动没动密钥、指纹变成什么，运营要能当场确认 */
function notifySaved(view: MiniProgramConfigView, beforeFingerprint: string | null): void {
  const after = view.secretFingerprint
  if (beforeFingerprint === after) {
    ElMessage.success(
      view.configured ? '配置已保存，AppSecret 沿用原值' : `配置已保存，仍缺 ${view.missingFields.join('、')}`,
    )
    return
  }
  if (after) {
    ElMessage.success(`配置已保存，AppSecret 指纹 ${beforeFingerprint ?? '--'} → ${after}`)
    return
  }
  ElMessage.warning('配置已保存，AppSecret 已清空，若 .env 无兜底值顾客将无法登录')
}

/** 清空密钥是显式危险动作：先二次确认，确认后输入框置空并保持「已标记清空」 */
async function requestClearSecret(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '确认清空已保存的 AppSecret？清空后数据库不再持有该凭据，若 .env 里没有兜底值，顾客将立刻无法登录小程序。',
      '确认清空 AppSecret',
      { type: 'warning', confirmButtonText: '确认清空', cancelButtonText: '再想想' },
    )
  } catch {
    return
  }
  clearSecretRequested.value = true
  secretInput.value = ''
}

function cancelClearSecret(): void {
  clearSecretRequested.value = false
}

function discardDraft(): void {
  syncForm(config.value)
  void configQuery.refetch()
}

async function handleSubmit(): Promise<void> {
  if (!canManage.value) {
    ElMessage.warning('没有小程序配置权限')
    return
  }
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  const beforeFingerprint = config.value?.secretFingerprint ?? null
  // 覆盖已有密钥是不可逆动作（旧密钥当场失效），与「清空」同档，都要二次确认
  if (secretAction.value === 'overwrite' && config.value?.secretConfigured) {
    try {
      await ElMessageBox.confirm(
        `即将覆盖已保存的 AppSecret（当前指纹 ${beforeFingerprint ?? '--'}）。覆盖后旧密钥立即失效，若贴错了值顾客会立刻无法登录。`,
        '确认覆盖 AppSecret',
        { type: 'warning', confirmButtonText: '确认覆盖', cancelButtonText: '再想想' },
      )
    } catch {
      return
    }
  }
  saveMutation.mutate({ input: buildInput(), beforeFingerprint })
}

const testMutation = useMutation({
  mutationFn: () => testMiniProgramConfig(),
  onSuccess: (result) => {
    testResult.value = result
    if (result.ok) ElMessage.success('自检通过，凭据可用')
    else ElMessage.warning('自检未通过，请对照提示检查配置')
  },
})

function handleTest(): void {
  testMutation.mutate()
}
</script>

<template>
  <div class="page-container">
    <el-alert
      v-if="configQuery.isError.value"
      type="error"
      :closable="false"
      show-icon
      title="小程序配置加载失败"
      :description="configQuery.error.value?.message ?? '请确认后端服务可用后重试'"
    >
      <template #default>
        <el-button size="small" :loading="configQuery.isFetching.value" @click="configQuery.refetch()">
          <el-icon><Refresh /></el-icon>
          <span>重新加载</span>
        </el-button>
      </template>
    </el-alert>

    <el-alert v-else-if="missingFields.length > 0" type="warning" :closable="false" show-icon>
      <template #title>
        <el-icon class="mp-icon-inline"><Warning /></el-icon>
        <span>必填凭据未配齐，顾客无法登录小程序</span>
      </template>
      <template #default>
        <el-space wrap :size="6">
          <span class="table-sub-text">缺少：</span>
          <el-tag v-for="field in missingFields" :key="field" type="danger" size="small" effect="plain">
            {{ field }}
          </el-tag>
        </el-space>
      </template>
    </el-alert>

    <div v-loading="configQuery.isFetching.value" class="mp-grid">
      <el-card class="page-card mp-card" shadow="never">
        <template #header>
          <div class="mp-card__head">
            <span class="mp-card__title">凭据录入</span>
            <el-button size="small" :loading="configQuery.isFetching.value" @click="configQuery.refetch()">
              <el-icon><Refresh /></el-icon>
              <span>刷新</span>
            </el-button>
          </div>
        </template>

        <p class="mp-intro">
          这里配置的是顾客端点餐小程序的微信凭据，全平台共用一套。AppID 可回显；AppSecret
          只写不读，接口只回传掩码与指纹，输入框留空或保持掩码即表示不修改。
        </p>

        <el-form ref="formRef" :model="form" :rules="rules" label-width="132px" :disabled="!canManage">
          <el-form-item label="小程序 AppID" prop="appId">
            <el-input
              v-model="form.appId"
              clearable
              maxlength="64"
              placeholder="如 wx1a2b3c4d5e6f7a8b"
              class="full-width"
            />
            <p class="table-sub-text">在微信公众平台「开发管理 - 开发设置」查看，形如 wx 开头的 18 位字符串。</p>
          </el-form-item>

          <el-form-item label="小程序 AppSecret">
            <el-input
              v-model="secretInput"
              type="password"
              autocomplete="new-password"
              maxlength="128"
              show-password
              :placeholder="secretPlaceholder"
              class="full-width"
            />
            <p class="mp-secret-meta">
              <el-tag :type="secretActionTag" size="small" effect="plain">{{ secretActionLabel }}</el-tag>
              <span class="table-sub-text">{{ secretSummary }}</span>
              <el-button
                v-if="config?.secretConfigured && secretAction === 'keep'"
                text
                type="danger"
                size="small"
                @click="requestClearSecret"
              >
                清空密钥
              </el-button>
              <el-button v-if="secretAction === 'clear'" text type="primary" size="small" @click="cancelClearSecret">
                取消清空
              </el-button>
            </p>
          </el-form-item>

          <el-form-item label="开放小程序登录">
            <el-switch v-model="form.loginEnabled" active-text="开启" inactive-text="关闭" inline-prompt />
            <span class="mp-field-tip">
              {{
                form.loginEnabled
                  ? '关闭后顾客端登录入口会被直接拒绝，用于紧急止血。'
                  : '当前已关闭，顾客无法登录小程序，与凭据是否完整无关。'
              }}
            </span>
          </el-form-item>
        </el-form>

        <template #footer>
          <div class="mp-footer">
            <el-button :disabled="!hasDraft" @click="discardDraft">放弃修改并重新读取</el-button>
            <el-button
              type="primary"
              :loading="saveMutation.isPending.value"
              :disabled="!canManage || !config"
              @click="handleSubmit"
            >
              保存配置
            </el-button>
          </div>
        </template>
      </el-card>

      <el-card class="page-card mp-card" shadow="never">
        <template #header>
          <div class="mp-card__head">
            <span class="mp-card__title">当前生效配置</span>
            <el-tag v-if="config?.configured" type="success" size="small" effect="dark">凭据齐备</el-tag>
            <el-tag v-else-if="config" type="danger" size="small" effect="dark">凭据不全</el-tag>
          </div>
        </template>

        <el-descriptions v-if="config" :column="1" border size="small">
          <el-descriptions-item label="凭据来源">
            <StatusTag :item="MINI_PROGRAM_CONFIG_SOURCE_DICT[config.source]" />
            <p class="table-sub-text">{{ MINI_PROGRAM_SOURCE_HINT[config.source] }}</p>
          </el-descriptions-item>
          <el-descriptions-item label=".env 兜底">
            <el-tag v-if="config.envFallbackAvailable" type="warning" size="small" effect="plain">
              .env 里有兜底值
            </el-tag>
            <span v-else class="text-muted">.env 无兜底值</span>
            <p class="table-sub-text">
              {{
                config.envFallbackAvailable
                  ? '本页凭据被清空后，后端仍会回落到 .env 的 MINI_APP_ID / MINI_APP_SECRET。'
                  : '本页没保存配置就没有任何凭据可用，顾客登录会直接失败。'
              }}
            </p>
          </el-descriptions-item>
          <el-descriptions-item label="AppID">
            <span v-if="config.appId" class="table-mono">{{ config.appId }}</span>
            <span v-else class="text-muted">未配置</span>
          </el-descriptions-item>
          <el-descriptions-item label="AppSecret">
            <el-space wrap :size="6">
              <el-tag :type="config.secretConfigured ? 'success' : 'info'" size="small" effect="plain">
                {{ config.secretConfigured ? '已配置' : '未配置' }}
              </el-tag>
              <span class="mp-mask table-mono">{{ config.secretMasked || '--' }}</span>
              <span class="text-muted">指纹 {{ config.secretFingerprint || '--' }}</span>
            </el-space>
          </el-descriptions-item>
          <el-descriptions-item label="登录开关">
            <el-tag :type="config.loginEnabled ? 'success' : 'info'" size="small" effect="plain">
              {{ config.loginEnabled ? '已开放' : '已关闭' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="最后修改">
            <span>{{ config.updatedByName || '—' }}</span>
            <TimeText :value="config.updatedAt" placeholder="尚未在后台保存过" class="mp-updated-time" />
          </el-descriptions-item>
        </el-descriptions>
        <el-empty v-else description="暂无配置数据" :image-size="70" />

        <el-divider content-position="left">连通性自检</el-divider>
        <div class="mp-test">
          <el-button
            type="primary"
            plain
            :loading="testMutation.isPending.value"
            :disabled="!canManage"
            @click="handleTest"
          >
            <el-icon><Connection /></el-icon>
            <span>立即自检</span>
          </el-button>
          <p class="table-sub-text">自检读取的是后端已保存的配置，不会带上本页未保存的改动。</p>
          <p v-if="hasDraft" class="mp-test-draft">当前有未保存的修改，建议先保存再自检。</p>
        </div>

        <el-alert
          v-if="testResult"
          :type="testResult.ok ? 'success' : 'error'"
          :closable="false"
          show-icon
          class="mp-test-result"
        >
          <template #title>
            <el-icon class="mp-icon-inline">
              <Check v-if="testResult.ok" />
              <CircleClose v-else />
            </el-icon>
            <span>{{ testResult.message }}</span>
          </template>
          <template #default>
            <span class="mp-test-time">检测时间</span>
            <TimeText :value="testResult.checkedAt" />
          </template>
        </el-alert>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.mp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 16px;
  align-items: start;
}

.mp-card {
  display: flex;
  flex-direction: column;
}

.mp-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mp-card__head {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.mp-card__title {
  font-size: 15px;
  font-weight: 600;
}

.mp-intro {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: #909399;
}

.mp-secret-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 4px 0 0;
  font-size: 12px;
}

.mp-mask {
  color: #67c23a;
}

.mp-field-tip {
  margin-left: 10px;
  font-size: 12px;
  color: #909399;
}

.mp-icon-inline {
  margin-right: 4px;
  vertical-align: -2px;
}

.mp-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.mp-updated-time {
  margin-left: 8px;
  font-size: 12px;
}

.mp-test {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.mp-test-draft {
  margin: 0;
  font-size: 12px;
  color: #e6a23c;
}

.mp-test-result {
  margin-top: auto;
}

.mp-test-time {
  margin-right: 6px;
  font-size: 12px;
  color: #606266;
}
</style>
