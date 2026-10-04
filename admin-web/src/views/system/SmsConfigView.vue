<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Check, CircleClose, Connection, Refresh, Warning } from '@element-plus/icons-vue'

import { fetchSmsConfig, testSmsConfig, updateSmsConfig } from '@/api/sms'
import { QUERY_KEYS } from '@/api/keys'
import type {
  SmsConfigUpdateInput,
  SmsConfigView,
  SmsDriver,
  SmsDriverMeta,
  SmsSecretField,
  SmsTestResult,
} from '@/api/types/sms'
import { PAYMENT_SECRET_MASK } from '@/constants/api'
import { SMS_SOURCE_HINT } from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { requiredRule } from '@/utils/validate'
import { useAuthStore } from '@/stores/auth'
import TimeText from '@/components/common/TimeText.vue'

const authStore = useAuthStore()
const queryClient = useQueryClient()

/** 路由已由 platform:sms:read 守卫；写操作再单独按 manage 控住 */
const canManage = computed(() => authStore.can(PERMISSION.smsManage))

const configQuery = useQuery({
  queryKey: QUERY_KEYS.smsConfig,
  queryFn: () => fetchSmsConfig(),
})

const config = computed<SmsConfigView | null>(() => configQuery.data.value ?? null)

const formRef = ref<FormInstance>()
const form = reactive({
  enabled: true,
  driver: 'aliyun' as SmsDriver,
  accessKeyId: '',
  sdkAppId: '',
  signName: '',
  templateCode: '',
  region: '',
  endpoint: '',
  customAuthHeader: '',
  customBodyTemplate: '',
})

/** 密钥输入值：字段名 -> 当前输入。明文从不下发，能显示的只有掩码，所以初始就是掩码。 */
const secretValues = reactive<Record<string, string>>({})

/** 当前选中通道的口径（字段、必填项、标签、密钥、兜底值），全部来自后端那一份常量 */
const meta = computed<SmsDriverMeta | null>(
  () => config.value?.drivers.find((item) => item.driver === form.driver) ?? null,
)

const isCustom = computed(() => form.driver === 'custom')
const isLog = computed(() => form.driver === 'log')

function isRequired(name: string): boolean {
  return meta.value?.requiredFields.includes(name) ?? false
}

/** 该字段名在这个通道下是不是密钥（是则渲染掩码输入框，而不是普通输入框） */
function secretView(name: string): SmsSecretField | null {
  return meta.value?.secretFields.find((field) => field.name === name) ?? null
}

function labelOf(name: string, fallback: string): string {
  return meta.value?.labels[name] ?? fallback
}

/**
 * 拉到配置后回填表单。
 * 密钥不回填明文（接口就没有给），只回填掩码；用户不动它就等于「保持原值」。
 */
watch(
  () => configQuery.data.value,
  (value) => {
    if (!value) return
    form.enabled = value.enabled
    form.driver = value.driver
    form.accessKeyId = value.accessKeyId ?? ''
    form.sdkAppId = value.sdkAppId ?? ''
    form.signName = value.signName ?? ''
    form.templateCode = value.templateCode ?? ''
    form.region = value.overrides.region ?? ''
    form.endpoint = value.overrides.endpoint ?? ''
    form.customAuthHeader = value.overrides.customAuthHeader ?? ''
    form.customBodyTemplate = value.overrides.customBodyTemplate ?? ''
  },
)

/** 换通道时按新通道重铺密钥输入框：同一个 accessKeySecret 字段在两家那里名字都不一样 */
watch(
  () => [form.driver, config.value?.drivers] as const,
  () => {
    for (const key of Object.keys(secretValues)) delete secretValues[key]
    for (const field of meta.value?.secretFields ?? []) {
      secretValues[field.name] = field.configured ? field.masked : ''
    }
  },
  { immediate: true },
)

const rules = computed<FormRules<typeof form>>(() => {
  const rule = (name: string, fallback: string) =>
    isRequired(name) ? [requiredRule(`请输入${labelOf(name, fallback)}`)] : []
  return {
    accessKeyId: rule('accessKeyId', 'AccessKey ID'),
    sdkAppId: rule('sdkAppId', '短信应用 SdkAppId'),
    signName: rule('signName', '短信签名'),
    templateCode: rule('templateCode', '验证码模板'),
    endpoint: rule('endpoint', '网关地址'),
    customBodyTemplate: rule('customBodyTemplate', '请求体模板'),
  }
})

/** 输入值与初始掩码不同即为「本次要改动」；等于掩码常量同样视为未改动 */
function isSecretDirty(field: SmsSecretField): boolean {
  const value = secretValues[field.name] ?? ''
  return value !== field.masked && value !== PAYMENT_SECRET_MASK
}

/** 原本已配置、这次被清空 —— 契约里这是「删除该密钥」的显式动作 */
function isSecretCleared(field: SmsSecretField): boolean {
  return field.configured && (secretValues[field.name] ?? '') === ''
}

/** 密钥框下面那颗标签：让运营在按下保存之前就知道会发生什么 */
function secretActionText(field: SmsSecretField): string {
  if (isSecretCleared(field)) return '已标记清空，保存后删除'
  if (isSecretDirty(field)) return '已修改，将覆盖原密钥'
  return field.configured ? '保持不变' : '未配置'
}

const secretChanges = computed(() => {
  const overwritten: string[] = []
  const cleared: string[] = []
  for (const field of meta.value?.secretFields ?? []) {
    if (!isSecretDirty(field)) continue
    if (isSecretCleared(field)) cleared.push(field.label)
    else overwritten.push(field.label)
  }
  return { overwritten, cleared }
})

/** 只提交真正改动过的密钥：未改动的字段直接不出现在请求体里，免得把掩码当明文写进去 */
function buildSecrets(): Record<string, string> | undefined {
  const secrets: Record<string, string> = {}
  for (const field of meta.value?.secretFields ?? []) {
    if (!isSecretDirty(field)) continue
    secrets[field.name] = (secretValues[field.name] ?? '').trim()
  }
  return Object.keys(secrets).length > 0 ? secrets : undefined
}

const secretChangeText = computed(() => {
  const { overwritten, cleared } = secretChanges.value
  const fields = meta.value?.secretFields ?? []
  if (overwritten.length === 0 && cleared.length === 0) {
    return fields.length > 0 ? '密钥保持不变，保存后沿用原值' : '该通道无需配置密钥'
  }
  const parts: string[] = []
  if (overwritten.length > 0) parts.push(`将覆盖：${overwritten.join('、')}`)
  if (cleared.length > 0) parts.push(`将清除：${cleared.join('、')}`)
  return parts.join('；')
})

/** 覆盖与清空都是不可逆动作，保存前一次二次确认说清动了哪几把密钥 */
async function confirmSecretChanges(): Promise<boolean> {
  const { overwritten, cleared } = secretChanges.value
  if (overwritten.length === 0 && cleared.length === 0) return true
  const lines = [
    overwritten.length ? `将覆盖：${overwritten.join('、')}` : '',
    cleared.length ? `将清除：${cleared.join('、')}，清除后顾客收不到验证码（仍可走微信手机号一键登录）` : '',
  ].filter(Boolean)
  try {
    await ElMessageBox.confirm(lines.join('\n'), '确认修改短信密钥', {
      confirmButtonText: '确认保存',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return false
  }
  return true
}

const sourceHint = computed(() => (config.value ? SMS_SOURCE_HINT[config.value.source] : ''))

/** 通道与已保存配置不同时提醒：云厂商共用同一列密钥，换通道不等于换凭据 */

/** 通道、开关、凭据三项的组合结论，直接说人话：运营最想知道的是「顾客现在能不能收到验证码」 */
const readinessText = computed(() => {
  const value = config.value
  if (!value) return ''
  // 状态说的是「已保存并生效的那份配置」，页面草稿切通道不该改写这段结论
  const live = value.driver
  if (!value.enabled) return '总开关已关闭：顾客端点「获取验证码」会收到「短信验证码未开启」'
  if (!value.configured) {
    const label = value.drivers.find((item) => item.driver === live)?.label ?? live
    return `「${label}」还缺：${value.missingFields.join('、')}，顾客暂时收不到验证码`
  }
  if (live === 'log') return '日志通道：验证码只写进服务日志、不真发送，只能用于开发与联调'
  if (live === 'custom') return '自定义网关配置就绪：配置就绪不等于对方可用，请用自己的手机号实收一条'
  return '配置就绪，顾客可正常收到验证码'
})

const readinessTag = computed<'success' | 'warning' | 'danger'>(() => {
  const value = config.value
  if (!value) return 'danger'
  if (!value.enabled || !value.configured) return 'danger'
  return value.driver === 'log' || value.driver === 'custom' ? 'warning' : 'success'
})

void Warning

const submitMutation = useMutation({
  mutationFn: (input: SmsConfigUpdateInput) => updateSmsConfig(input),
  onSuccess: (data) => {
    ElMessage.success('短信配置已保存')
    // 上一次自检结论属于旧配置，留着会让人以为「刚保存的配置也报这个错」
    testResult.value = null
    queryClient.setQueryData(QUERY_KEYS.smsConfig, data)
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.smsConfig })
  },
})

async function submit(): Promise<void> {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  if (!(await confirmSecretChanges())) return

  const secrets = buildSecrets()
  submitMutation.mutate({
    enabled: form.enabled,
    driver: form.driver,
    accessKeyId: form.accessKeyId.trim() || null,
    sdkAppId: form.sdkAppId.trim() || null,
    signName: form.signName.trim() || null,
    templateCode: form.templateCode.trim() || null,
    region: form.region.trim() || null,
    endpoint: form.endpoint.trim() || null,
    customAuthHeader: form.customAuthHeader.trim() || null,
    customBodyTemplate: form.customBodyTemplate.trim() || null,
    ...(secrets ? { secrets } : {}),
  })
}

const testResult = ref<SmsTestResult | null>(null)

const testMutation = useMutation({
  mutationFn: () => testSmsConfig(),
  onSuccess: (data) => {
    testResult.value = data
    if (data.ok) ElMessage.success(data.message)
    else ElMessage.warning(data.message)
  },
})

const driverOptions = computed(() =>
  (config.value?.drivers ?? []).map((item) => ({
    value: item.driver,
    label:
      item.driver === 'log'
        ? config.value?.logAllowed
          ? '日志通道（仅开发联调）'
          : '日志通道（生产环境不可用）'
        : item.label,
    disabled: item.driver === 'log' && !config.value?.logAllowed,
  })),
)

/** 切了通道但没重新填密钥时的提醒文案 */
const switchHint = computed(() => {
  const saved = config.value?.driverOverride
  if (!saved || saved === form.driver) return ''
  return `已保存的通道是「${config.value?.drivers.find((d) => d.driver === saved)?.label ?? saved}」：云厂商两家共用同一列密钥，换通道后请重新填写该通道的密钥并点「自检」。`
})
</script>

<template>
  <div class="page-container">
    <el-card class="page-card" shadow="never">
      <template #header>
        <div class="panel__header">
          <span>短信配置</span>
          <el-space>
            <el-tag v-if="!canManage" type="info" size="small" effect="plain">只读</el-tag>
            <el-button @click="configQuery.refetch()">
              <el-icon><Refresh /></el-icon>
              <span>刷新</span>
            </el-button>
            <el-button
              :icon="Connection"
              :loading="testMutation.isPending.value"
              :disabled="!canManage"
              @click="testMutation.mutate()"
            >
              自检
            </el-button>
            <el-button
              type="primary"
              :loading="submitMutation.isPending.value"
              :disabled="!canManage"
              @click="submit"
            >
              保存配置
            </el-button>
          </el-space>
        </div>
      </template>

      <p class="panel__intro">
        顾客登录页的「获取验证码」走的就是这里的配置。短信签名与模板要按主体过云厂商审核，
        一套凭据服务全部商户，所以商户与门店都接触不到这些密钥 —— 商家端不需要、也不应该出现短信配置入口。
        密钥密文入库，接口只回掩码与指纹。
      </p>

      <el-alert
        v-if="config && !config.configured"
        class="panel__alert"
        type="warning"
        :closable="false"
        show-icon
        :title="readinessText"
      />
      <el-alert
        v-else-if="config"
        class="panel__alert"
        :type="readinessTag === 'success' ? 'success' : 'info'"
        :closable="false"
        show-icon
        :title="readinessText"
      />

      <el-alert
        v-if="testResult"
        class="panel__alert"
        :type="testResult.ok ? 'success' : 'error'"
        :closable="false"
        show-icon
        :title="testResult.message"
      >
        <template #default>
          <span class="panel__meta">
            检测时间 <TimeText :value="testResult.checkedAt" />（自检读的是已保存配置，不是页面草稿）
          </span>
        </template>
      </el-alert>

      <el-form
        v-loading="configQuery.isFetching.value"
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="170px"
        :disabled="!canManage"
        class="panel__form"
      >
        <el-form-item label="短信验证码总开关">
          <el-switch
            v-model="form.enabled"
            active-text="开启"
            inactive-text="关闭"
            inline-prompt
          />
          <span class="panel__tip">关闭后顾客仍可走「微信手机号一键登录」。</span>
        </el-form-item>

        <el-form-item label="通道">
          <el-radio-group v-model="form.driver">
            <el-radio
              v-for="option in driverOptions"
              :key="option.value"
              :value="option.value"
              :disabled="option.disabled"
            >
              {{ option.label }}
            </el-radio>
          </el-radio-group>
          <p v-if="switchHint" class="panel__warn-text">{{ switchHint }}</p>
        </el-form-item>

        <template v-if="isLog">
          <el-form-item label="通道说明">
            <span class="panel__tip">
              日志通道不需要任何凭据：验证码只写进服务日志，用于本机与 CI 把
              「发码 → 校验 → 登录」整条跑通。生产环境不允许使用该通道。
            </span>
          </el-form-item>
        </template>

        <template v-else>
          <!-- 字段顺序由后端那份通道口径（SMS_DRIVER_FIELDS）决定，界面不自己排第二遍 -->
          <template v-for="name in meta?.fields ?? []" :key="name">
            <el-form-item v-if="secretView(name)" :label="secretView(name)!.label">
              <el-input
                v-model="secretValues[name]"
                type="password"
                show-password
                :placeholder="
                  secretView(name)!.configured
                    ? `${PAYMENT_SECRET_MASK} 已配置，留空或保持掩码表示不修改`
                    : `尚未配置，请填写${secretView(name)!.label}`
                "
              />
              <div class="secret-meta">
                <el-tag
                  :type="
                    isSecretCleared(secretView(name)!)
                      ? 'danger'
                      : isSecretDirty(secretView(name)!)
                        ? 'warning'
                        : 'info'
                  "
                  size="small"
                  effect="plain"
                >
                  {{ secretActionText(secretView(name)!) }}
                </el-tag>
                <span v-if="secretView(name)!.fingerprint" class="panel__mono">
                  指纹 {{ secretView(name)!.fingerprint }}
                </span>
              </div>
            </el-form-item>

            <el-form-item v-else-if="name === 'accessKeyId'" :label="labelOf(name, 'AccessKey ID')" prop="accessKeyId">
              <el-input
                v-model="form.accessKeyId"
                clearable
                maxlength="64"
                :placeholder="
                  form.driver === 'tencent'
                    ? '腾讯云「访问密钥」里的 SecretId'
                    : '阿里云 RAM 用户的 AccessKey ID'
                "
              />
            </el-form-item>

            <el-form-item v-else-if="name === 'sdkAppId'" :label="labelOf(name, '短信应用 SdkAppId')" prop="sdkAppId">
              <el-input
                v-model="form.sdkAppId"
                clearable
                maxlength="64"
                placeholder="腾讯云短信控制台「应用管理」里的数字 AppId，如 1400123456"
              />
              <span class="panel__tip">这是短信应用的 ID，不是云 API 密钥，也不是账号 UIN。</span>
            </el-form-item>

            <el-form-item v-else-if="name === 'signName'" :label="labelOf(name, '短信签名')" prop="signName">
              <el-input
                v-model="form.signName"
                clearable
                maxlength="64"
                :placeholder="isCustom ? '作为 {signName} 占位符可用，是否发送由网关决定' : '云厂商审核通过的签名名，如「川味小馆」'"
              />
            </el-form-item>

            <el-form-item v-else-if="name === 'templateCode'" :label="labelOf(name, '验证码模板')" prop="templateCode">
              <el-input
                v-model="form.templateCode"
                clearable
                maxlength="64"
                :placeholder="
                  form.driver === 'tencent'
                    ? '腾讯云正文模板 ID，如 1840673；模板正文只留一个变量位 {1}'
                    : isCustom
                      ? '作为 {templateCode} 占位符可用'
                      : '如 SMS_123456789，模板变量名固定为 code'
                "
              />
              <span v-if="form.driver === 'tencent'" class="panel__tip">
                腾讯云的模板变量是<strong>按位置</strong>的（写作 {1}），后端只传验证码这一个值，模板里只能留一个变量位。
              </span>
              <span v-else-if="!isCustom" class="panel__tip">
                模板内容形如「您的验证码为${code}，5 分钟内有效」。变量名不是 code 时云厂商会直接拒。
              </span>
            </el-form-item>

            <el-form-item v-else-if="name === 'endpoint'" :label="labelOf(name, '网关地址')" prop="endpoint">
              <el-input
                v-model="form.endpoint"
                clearable
                maxlength="255"
                :placeholder="
                  isCustom
                    ? '必填，形如 https://sms.example.com/send'
                    : `留空使用官方地址 ${config?.endpoint ?? ''}`
                "
              />
              <span class="panel__tip">
                {{
                  isCustom
                    ? '一律 POST JSON；网关返回 2xx 即视为发送成功，其余状态码会作为失败原因显示。'
                    : '仅联调沙箱或自建代理时需要改。'
                }}
              </span>
            </el-form-item>

            <el-form-item v-else-if="name === 'customAuthHeader'" :label="labelOf(name, '鉴权头')">
              <el-input
                v-model="form.customAuthHeader"
                clearable
                maxlength="255"
                :placeholder="`留空即用默认：${meta?.defaults.authHeader ?? ''}`"
              />
              <span class="panel__tip">
                格式是「头名: 头值模板」，头值里的 <span class="panel__mono">{token}</span> 会换成网关密钥；
                网关不要鉴权就留空（且别填密钥）。
              </span>
            </el-form-item>

            <el-form-item v-else-if="name === 'customBodyTemplate'" :label="labelOf(name, '请求体模板')" prop="customBodyTemplate">
              <el-input
                v-model="form.customBodyTemplate"
                type="textarea"
                :rows="4"
                maxlength="4000"
                :placeholder="`留空即用默认：${meta?.defaults.bodyTemplate ?? ''}`"
              />
              <span class="panel__tip">
                必须是合法 JSON，可用占位符 <span class="panel__mono">{phone} {code} {signName} {templateCode} {token}</span>，
                且要写成带引号的形式（<span class="panel__mono">"code":"{code}"</span>）。
              </span>
            </el-form-item>

            <el-form-item v-else-if="name === 'region'" :label="labelOf(name, '地域')">
              <el-input
                v-model="form.region"
                clearable
                maxlength="32"
                :placeholder="`留空使用默认值 ${config?.region || meta?.defaults.region || ''}`"
              />
            </el-form-item>
          </template>
        </template>

        <p v-if="meta && meta.secretFields.length > 0" class="panel__summary">{{ secretChangeText }}</p>
      </el-form>

      <div class="panel__footer">
        <span class="panel__meta">
          生效来源：{{ config?.source === 'database' ? '本页保存的配置' : (config?.source === 'env' ? '.env 兜底' : '未配置') }}
          · {{ sourceHint }}
        </span>
        <span class="panel__meta">
          最后修改：<TimeText :value="config?.updatedAt ?? null" placeholder="尚未在后台保存过" />
          <template v-if="config?.updatedByName"> · {{ config.updatedByName }}</template>
        </span>
      </div>
    </el-card>

    <el-card class="page-card" shadow="never">
      <template #header>
        <div class="panel__header">
          <span>接入步骤（{{ meta?.label ?? '当前通道' }}）</span>
        </div>
      </template>
      <ol class="steps">
        <template v-if="form.driver === 'aliyun'">
          <li>
            <el-icon class="steps__icon"><Warning /></el-icon>
            用企业资质在阿里云开通「短信服务」，申请<b>签名</b>与<b>验证码模板</b>；审核通常 1~2 个工作日。
          </li>
          <li>
            <el-icon class="steps__icon"><Warning /></el-icon>
            模板变量名必须是 <span class="panel__mono">code</span>，后端下发时只带这一个变量。
          </li>
          <li>
            <el-icon class="steps__icon"><Warning /></el-icon>
            建议单独建 RAM 用户，只授予 <span class="panel__mono">AliyunDysmsFullAccess</span>，不要把主账号 AccessKey 放进来。
          </li>
          <li>
            <el-icon class="steps__icon"><Check /></el-icon>
            填完点「自检」：它调 QuerySmsSign 查签名审核状态，<b>不消耗发送额度</b>。
          </li>
        </template>

        <template v-else-if="form.driver === 'tencent'">
          <li>
            <el-icon class="steps__icon"><Warning /></el-icon>
            腾讯云短信要三样东西：签名、正文模板 ID、以及<b>短信应用 SdkAppId</b>（控制台「应用管理」里，
            常被漏掉的就是这一个，缺它发送直接回参数错误）。
          </li>
          <li>
            <el-icon class="steps__icon"><Warning /></el-icon>
            模板正文只留<b>一个变量位</b>，形如「您的验证码为{1}，5 分钟内有效」；腾讯云的变量是按位置的，不是按名字。
          </li>
          <li>
            <el-icon class="steps__icon"><Warning /></el-icon>
            密钥用子账号的 <span class="panel__mono">SecretId / SecretKey</span>，CAM 策略给
            <span class="panel__mono">QcloudSmsFullAccess</span>（或按需只给 SMS 相关只读 + 发送）。
          </li>
          <li>
            <el-icon class="steps__icon"><Check /></el-icon>
            填完点「自检」：它调 DescribeSmsTemplateList 查模板是否存在与审核状态，<b>不消耗发送额度</b>，
            还会顺手告诉你模板里有几个变量位。
          </li>
        </template>

        <template v-else-if="form.driver === 'custom'">
          <li>
            <el-icon class="steps__icon"><Warning /></el-icon>
            网关地址填完整 URL（含 https://），本系统一律 <b>POST JSON</b>，不支持 GET 与表单编码。
          </li>
          <li>
            <el-icon class="steps__icon"><Warning /></el-icon>
            请求体模板必须是合法 JSON，占位符写在引号里：
            <span class="panel__mono">{"phone":"{phone}","code":"{code}"}</span>；
            留空即用默认那份。
          </li>
          <li>
            <el-icon class="steps__icon"><Warning /></el-icon>
            鉴权按「头名: 头值模板」写，例如 <span class="panel__mono">Authorization: Bearer {token}</span>；
            网关不要鉴权就留空。密钥本身密文入库、只回掩码。
          </li>
          <li>
            <el-icon class="steps__icon"><Check /></el-icon>
            <b>HTTP 2xx 即算发送成功</b>，其余状态码会把网关回话摘要显示成失败原因。
          </li>
          <li>
            <el-icon class="steps__icon"><CircleClose /></el-icon>
            自定义通道没有免费的「查审核状态」接口，所以「自检」只校验配置形状、<b>不真发</b>：
            上线前请用自己的手机号在顾客登录页实收一条。
          </li>
        </template>

        <template v-else>
          <li>
            <el-icon class="steps__icon"><Warning /></el-icon>
            日志通道不需要凭据，验证码只写进服务日志（Logger 名 <span class="panel__mono">LogSmsProvider</span>），
            手机号只留后四位。
          </li>
          <li>
            <el-icon class="steps__icon"><CircleClose /></el-icon>
            生产环境（<span class="panel__mono">APP_ENV=production</span>）禁止使用：
            开着总开关保存会被直接拒，验证码进日志等于抄给整套日志采集系统。
          </li>
        </template>

        <li>
          <el-icon class="steps__icon"><CircleClose /></el-icon>
          自检通过后仍要真发一条给顾客才算上线：短信按条计费，账户要有余额。
        </li>
      </ol>
    </el-card>
  </div>
</template>

<style scoped>
.panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 15px;
  font-weight: 600;
}

.panel__intro {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.7;
  color: #606266;
}

.panel__alert {
  margin-bottom: 12px;
}

.panel__form {
  max-width: 760px;
}

.panel__tip {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
}

.panel__meta {
  font-size: 12px;
  color: #909399;
}

.panel__mono {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
}

.panel__warn-text {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #e6a23c;
}

.panel__summary {
  margin: 4px 0 0;
  padding: 8px 10px;
  font-size: 12px;
  color: #606266;
  background: #f8fafd;
  border-radius: 6px;
}

.panel__footer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
}

.secret-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.steps {
  margin: 0;
  padding-left: 4px;
  font-size: 13px;
  line-height: 2;
  color: #606266;
}

.steps__icon {
  margin-right: 6px;
  color: #909399;
  vertical-align: -2px;
}
</style>
