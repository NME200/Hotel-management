<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Connection, Edit, Refresh, Warning } from '@element-plus/icons-vue'

import { fetchPaymentChannels, testPaymentChannel, updatePaymentChannel } from '@/api/payment'
import { QUERY_KEYS } from '@/api/keys'
import type { PaymentChannel, PaymentChannelItem, PaymentChannelTestResult } from '@/api/types/payment'
import { PAYMENT_CONFIG_SOURCE_DICT, dictLabel, paymentFieldLabel } from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { formatDateTime } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import ChannelConfigDialog from './components/ChannelConfigDialog.vue'

const authStore = useAuthStore()
const queryClient = useQueryClient()

/** 页面本身由 platform:payment:manage 守卫，这里再按权限控制写操作按钮，避免后端后续放权时改代码 */
const canManage = computed(() => authStore.can(PERMISSION.paymentManage))

const channelsQuery = useQuery({
  queryKey: QUERY_KEYS.paymentChannels,
  queryFn: () => fetchPaymentChannels(),
  enabled: canManage,
})

const channels = computed<PaymentChannelItem[]>(() => channelsQuery.data.value ?? [])
const unreadyChannels = computed(() => channels.value.filter((item) => !item.ready))

const dialogVisible = ref(false)
const editingChannel = ref<PaymentChannelItem | null>(null)

/** 自检结果只服务当前这一次操作，放本地状态，不进 Query 缓存 */
const testResults = reactive<Partial<Record<PaymentChannel, PaymentChannelTestResult>>>({})

function openEdit(row: PaymentChannelItem): void {
  editingChannel.value = row
  dialogVisible.value = true
}

const toggleMutation = useMutation({
  mutationFn: (variables: { channel: PaymentChannel; enabled: boolean }) =>
    updatePaymentChannel(variables.channel, { enabled: variables.enabled }),
  onSuccess: (data) => {
    ElMessage.success(data.enabled ? `已开启「${data.label}」` : `已关闭「${data.label}」，商户端将不再展示该支付方式`)
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.paymentChannels })
  },
})

const testMutation = useMutation({
  mutationFn: (channel: PaymentChannel) => testPaymentChannel(channel),
  onSuccess: (result, channel) => {
    testResults[channel] = result
    if (result.ok) ElMessage.success('自检通过，凭据可用')
    else ElMessage.warning('自检未通过，请对照提示检查配置')
  },
})

/** 关闭总开关会影响全部商户，走二次确认；开启不阻塞下单，直接生效 */
async function handleToggle(row: PaymentChannelItem, next: boolean): Promise<void> {
  if (!canManage.value) {
    ElMessage.warning('没有渠道配置权限')
    return
  }
  if (!next) {
    try {
      await ElMessageBox.confirm(
        `确认关闭「${row.label}」？关闭后所有商户都无法使用该支付方式下单，已产生的订单不受影响。`,
        '关闭支付渠道',
        { type: 'warning', confirmButtonText: '确认关闭', cancelButtonText: '取消' },
      )
    } catch {
      return
    }
  }
  toggleMutation.mutate({ channel: row.channel, enabled: next })
}

function handleTest(row: PaymentChannelItem): void {
  testMutation.mutate(row.channel)
}

/** 只锁住当前正在操作的那张卡片，避免一条渠道自检时三条同时转圈 */
function isToggling(row: PaymentChannelItem): boolean {
  return toggleMutation.isPending.value && toggleMutation.variables.value?.channel === row.channel
}

function isTesting(row: PaymentChannelItem): boolean {
  return testMutation.isPending.value && testMutation.variables.value === row.channel
}

function switchValue(event: string | number | boolean): boolean {
  return event === true
}

/** 缺失字段的可读列表，密钥类字段名由后端下发 label */
function missingFieldsText(row: PaymentChannelItem): string {
  return row.missingFields.map((field) => paymentFieldLabel(field, row.secretFields)).join('、')
}

function hasMissingFields(row: PaymentChannelItem): boolean {
  return row.missingFields.length > 0
}

/** 未就绪分两种原因：凭据没填全，或后端还没接入该渠道实现 */
function readinessHint(row: PaymentChannelItem): string {
  return hasMissingFields(row)
    ? `缺少 ${missingFieldsText(row)}，商户发起支付会被直接拒绝。`
    : '凭据已齐，但该渠道的实现尚未接入，暂时不能下单。'
}
</script>

<template>
  <div class="page-container">
    <el-alert
      v-if="channelsQuery.isError.value"
      type="error"
      :closable="false"
      show-icon
      title="支付渠道配置加载失败"
      :description="channelsQuery.error.value?.message ?? '请确认后端服务可用后重试'"
    >
      <template #default>
        <el-button size="small" :loading="channelsQuery.isFetching.value" @click="channelsQuery.refetch()">
          <el-icon><Refresh /></el-icon>
          <span>重新加载</span>
        </el-button>
      </template>
    </el-alert>

    <el-alert
      v-else-if="unreadyChannels.length > 0"
      type="warning"
      :closable="false"
      show-icon
      title="有渠道凭据不全，暂时无法下单"
    >
      <template #default>
        <el-space wrap :size="6">
          <el-tag v-for="row in unreadyChannels" :key="row.channel" type="danger" size="small" effect="plain">
            {{ row.label }}：{{ hasMissingFields(row) ? missingFieldsText(row) : '渠道实现尚未接入' }}
          </el-tag>
        </el-space>
      </template>
    </el-alert>

    <div class="page-card">
      <div class="page-toolbar">
        <p class="channel-intro">
          渠道级配置对全平台生效：总开关关闭后所有商户都不可使用该支付方式；密钥仅在本页录入，接口只回传掩码与指纹。
        </p>
        <el-button @click="channelsQuery.refetch()">
          <el-icon><Refresh /></el-icon>
          <span>刷新</span>
        </el-button>
      </div>
    </div>

    <div v-loading="channelsQuery.isFetching.value" class="channel-row">
      <el-card v-for="row in channels" :key="row.channel" class="page-card channel-card" shadow="never">
        <template #header>
          <div class="channel-card__head">
            <div class="cell-text">
              <span class="channel-card__name">{{ row.label }}</span>
              <p class="table-sub-text table-mono">{{ row.channel }}</p>
            </div>
            <el-space :size="6">
              <el-tag :type="PAYMENT_CONFIG_SOURCE_DICT[row.source]?.tag ?? 'info'" size="small" effect="plain">
                {{ dictLabel(PAYMENT_CONFIG_SOURCE_DICT, row.source) }}
              </el-tag>
              <el-tag v-if="row.ready" type="success" size="small" effect="dark">可下单</el-tag>
              <el-tag v-else :type="hasMissingFields(row) ? 'danger' : 'warning'" size="small" effect="dark">
                {{ hasMissingFields(row) ? '凭据不全' : '未接入' }}
              </el-tag>
            </el-space>
          </div>
        </template>

        <div class="channel-card__switch">
          <span class="channel-card__switch-label">平台总开关</span>
          <el-switch
            :model-value="row.enabled"
            :disabled="!canManage || isToggling(row)"
            :loading="isToggling(row)"
            @change="handleToggle(row, switchValue($event))"
          />
          <span class="text-muted">{{ row.enabled ? '已开启' : '已关闭' }}</span>
        </div>

        <el-descriptions :column="1" border size="small" class="channel-card__desc">
          <el-descriptions-item v-if="row.channel !== 'mock'" label="通知地址">
            <span v-if="row.notifyUrl" class="channel-card__url">{{ row.notifyUrl }}</span>
            <span v-else class="text-muted">未配置</span>
          </el-descriptions-item>
          <el-descriptions-item v-if="row.appId" :label="row.channel === 'wechat' ? '服务商 AppID' : 'AppID'">
            <span class="table-mono">{{ row.appId }}</span>
          </el-descriptions-item>
          <el-descriptions-item v-if="row.mchId" label="服务商商户号">
            <span class="table-mono">{{ row.mchId }}</span>
          </el-descriptions-item>
          <el-descriptions-item v-if="row.channel === 'alipay'" label="沙箱环境">
            <el-tag :type="row.sandbox ? 'warning' : 'info'" size="small" effect="plain">
              {{ row.sandbox ? '沙箱' : '正式环境' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ row.updatedAt ? formatDateTime(row.updatedAt) : '尚未在后台保存过' }}
          </el-descriptions-item>
        </el-descriptions>

        <div v-if="row.secretFields.length > 0" class="channel-card__secrets">
          <p class="channel-card__subtitle">密钥</p>
          <ul class="secret-list">
            <li v-for="secret in row.secretFields" :key="secret.name" class="secret-list__item">
              <span class="secret-list__label text-ellipsis">{{ secret.label }}</span>
              <el-tag :type="secret.configured ? 'success' : 'info'" size="small" effect="plain">
                {{ secret.configured ? '已配置' : '未配置' }}
              </el-tag>
              <span class="secret-list__fingerprint table-mono">{{ secret.fingerprint || '--' }}</span>
            </li>
          </ul>
        </div>
        <p v-else class="table-sub-text channel-card__no-secret">该渠道无需密钥</p>

        <el-alert
          v-if="!row.ready"
          :type="hasMissingFields(row) ? 'error' : 'warning'"
          :closable="false"
          show-icon
          class="channel-card__warn"
        >
          <template #title>
            <el-icon class="channel-card__warn-icon"><Warning /></el-icon>
            <span>{{ readinessHint(row) }}</span>
          </template>
        </el-alert>

        <el-alert
          v-if="testResults[row.channel]"
          :type="testResults[row.channel]?.ok ? 'success' : 'error'"
          :closable="false"
          show-icon
          class="channel-card__result"
        >
          <template #title>
            <span>{{ testResults[row.channel]?.message }}</span>
          </template>
          <template #default>
            <span class="channel-card__result-time">检测时间 {{ formatDateTime(testResults[row.channel]?.checkedAt) }}</span>
          </template>
        </el-alert>

        <template #footer>
          <div class="channel-card__footer">
            <el-button v-if="canManage" text type="primary" @click="openEdit(row)">
              <el-icon><Edit /></el-icon>
              <span>编辑配置</span>
            </el-button>
            <el-button text type="primary" :loading="isTesting(row)" @click="handleTest(row)">
              <el-icon><Connection /></el-icon>
              <span>测试连接</span>
            </el-button>
          </div>
        </template>
      </el-card>

      <el-empty
        v-if="channels.length === 0 && !channelsQuery.isFetching.value"
        :description="channelsQuery.isError.value ? '暂无渠道，请确认后端服务已启动' : '暂无支付渠道'"
        :image-size="80"
      />
    </div>

    <ChannelConfigDialog v-model="dialogVisible" :record="editingChannel" />
  </div>
</template>

<style scoped>
.channel-intro {
  margin: 0;
  max-width: 860px;
  font-size: 12px;
  line-height: 1.7;
  color: #909399;
}

.channel-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: stretch;
  min-height: 120px;
}

.channel-card {
  display: flex;
  flex-direction: column;
  flex: 1 1 340px;
  min-width: 320px;
  max-width: 480px;
}

.channel-card :deep(.el-card__body) {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
}

.channel-card__head {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.channel-card__name {
  font-size: 16px;
  font-weight: 600;
}

.channel-card__switch {
  display: flex;
  gap: 10px;
  align-items: center;
}

.channel-card__switch-label {
  font-size: 13px;
  color: #606266;
}

.channel-card__url {
  word-break: break-all;
}

.channel-card__subtitle {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
}

.channel-card__secrets {
  padding: 8px 10px;
  background: #f8fafd;
  border: 1px solid #eef1f6;
  border-radius: 6px;
}

.secret-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.secret-list__item {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 3px 0;
  font-size: 12px;
}

.secret-list__label {
  flex: 1;
  min-width: 0;
}

.secret-list__fingerprint {
  color: #909399;
}

.channel-card__no-secret {
  margin: 0;
}

.channel-card__warn,
.channel-card__result {
  margin-top: auto;
}

.channel-card__warn-icon {
  margin-right: 4px;
  vertical-align: -2px;
}

.channel-card__result-time {
  font-size: 12px;
  color: #606266;
}

.channel-card__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
