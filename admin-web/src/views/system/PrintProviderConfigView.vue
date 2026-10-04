<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Connection, Edit, Refresh, Warning } from '@element-plus/icons-vue'

import { fetchPrintProviders, testPrintProvider, updatePrintProvider } from '@/api/print-provider'
import { QUERY_KEYS } from '@/api/keys'
import type { PrintProvider, PrintProviderItem, PrintProviderTestResult } from '@/api/types/print-provider'
import {
  PRINT_CONFIG_SOURCE_DICT,
  dictLabel,
  printProviderFieldLabel,
} from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { formatDateTime } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import PrintProviderConfigDialog from './components/PrintProviderConfigDialog.vue'

const authStore = useAuthStore()
const queryClient = useQueryClient()

/**
 * 页面对运营只读开放（platform:print:read），编辑按钮再按 platform:print:manage 控制。
 * 两个权限点分开是因为密钥是平台与厂商之间的合同凭据，不该由运营改。
 */
const canRead = computed(() => authStore.can(PERMISSION.printRead))
const canManage = computed(() => authStore.can(PERMISSION.printManage))

const providersQuery = useQuery({
  queryKey: QUERY_KEYS.printProviders,
  queryFn: () => fetchPrintProviders(),
  enabled: canRead,
})

const providers = computed<PrintProviderItem[]>(() => providersQuery.data.value ?? [])
const unconfiguredProviders = computed(() => providers.value.filter((item) => !item.configured))

const dialogVisible = ref(false)
const editingProvider = ref<PrintProviderItem | null>(null)

/** 自检结果只服务当前这一次操作，放本地状态，不进 Query 缓存 */
const testResults = reactive<Partial<Record<PrintProvider, PrintProviderTestResult>>>({})

function openEdit(row: PrintProviderItem): void {
  editingProvider.value = row
  dialogVisible.value = true
}

const toggleMutation = useMutation({
  mutationFn: (variables: { provider: PrintProvider; enabled: boolean }) =>
    updatePrintProvider(variables.provider, { enabled: variables.enabled }),
  onSuccess: (data) => {
    ElMessage.success(
      data.enabled
        ? `已开启「${data.label}」，商户填了设备号即可出纸`
        : `已关闭「${data.label}」，商户推送小票会被拒绝`,
    )
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.printProviders })
  },
})

const testMutation = useMutation({
  mutationFn: (provider: PrintProvider) => testPrintProvider(provider),
  onSuccess: (result, provider) => {
    testResults[provider] = result
    if (result.ok) ElMessage.success('自检通过，凭据可用')
    else ElMessage.warning('自检未通过，请对照提示检查配置')
  },
})

/** 关闭总开关会让所有用该厂商的商户打不出票，走二次确认；开启不阻塞，直接生效 */
async function handleToggle(row: PrintProviderItem, next: boolean): Promise<void> {
  if (!canManage.value) {
    ElMessage.warning('没有云打印机配置权限')
    return
  }
  if (!next) {
    try {
      await ElMessageBox.confirm(
        `确认关闭「${row.label}」？关闭后所有商户的该厂商云打印机都无法出纸，已产生的打印流水不受影响。`,
        '关闭云打印机厂商',
        { type: 'warning', confirmButtonText: '确认关闭', cancelButtonText: '取消' },
      )
    } catch {
      return
    }
  }
  toggleMutation.mutate({ provider: row.provider, enabled: next })
}

function handleTest(row: PrintProviderItem): void {
  testMutation.mutate(row.provider)
}

/** 只锁住当前正在操作的那张卡片，避免一条厂商自检时两张同时转圈 */
function isToggling(row: PrintProviderItem): boolean {
  return toggleMutation.isPending.value && toggleMutation.variables.value?.provider === row.provider
}

function isTesting(row: PrintProviderItem): boolean {
  return testMutation.isPending.value && testMutation.variables.value === row.provider
}

function switchValue(event: string | number | boolean): boolean {
  return event === true
}

function missingFieldsText(row: PrintProviderItem): string {
  return row.missingFields.map((field) => printProviderFieldLabel(field, row.secretFields)).join('、')
}

/** 未就绪只有一种原因：凭据没配齐。实现是内置的，不存在「未接入」 */
function readinessHint(row: PrintProviderItem): string {
  return `缺少 ${missingFieldsText(row)}，商户推送小票会被直接拒绝。`
}

/** 账号字段的名称随厂商而变，别写死成「uid」 */
function accountLabel(provider: PrintProvider): string {
  return provider === 'feie' ? '飞鹅账号 user' : '应用 client_id'
}
</script>

<template>
  <div class="page-container">
    <el-alert
      v-if="providersQuery.isError.value"
      type="error"
      :closable="false"
      show-icon
      title="云打印机配置加载失败"
      :description="providersQuery.error.value?.message ?? '请确认后端服务可用后重试'"
    >
      <template #default>
        <el-button size="small" :loading="providersQuery.isFetching.value" @click="providersQuery.refetch()">
          <el-icon><Refresh /></el-icon>
          <span>重新加载</span>
        </el-button>
      </template>
    </el-alert>

    <el-alert
      v-else-if="unconfiguredProviders.length > 0"
      type="warning"
      :closable="false"
      show-icon
      title="有厂商凭据不全，对应品牌的云打印机暂时无法出纸"
    >
      <template #default>
        <el-space wrap :size="6">
          <el-tag
            v-for="row in unconfiguredProviders"
            :key="row.provider"
            type="danger"
            size="small"
            effect="plain"
          >
            {{ row.label }}：{{ missingFieldsText(row) }}
          </el-tag>
        </el-space>
      </template>
    </el-alert>

    <div class="page-card">
      <div class="page-toolbar">
        <p class="provider-intro">
          厂商账号与密钥只在本页录入，属于平台与厂商之间的合同凭据：商户在「打印设置」里选择品牌并填设备号（sn）即可出纸，不需要也不应该接触这些密钥。
          密钥接口只回传掩码与指纹，永不回显明文。
        </p>
        <el-space>
          <el-tag v-if="!canManage" type="info" size="small" effect="plain">只读</el-tag>
          <el-button @click="providersQuery.refetch()">
            <el-icon><Refresh /></el-icon>
            <span>刷新</span>
          </el-button>
        </el-space>
      </div>
    </div>

    <div v-loading="providersQuery.isFetching.value" class="provider-row">
      <el-card
        v-for="row in providers"
        :key="row.provider"
        class="page-card provider-card"
        shadow="never"
      >
        <template #header>
          <div class="provider-card__head">
            <div class="cell-text">
              <span class="provider-card__name">{{ row.label }}</span>
              <p class="table-sub-text table-mono">{{ row.provider }}</p>
            </div>
            <el-space :size="6">
              <el-tag
                :type="PRINT_CONFIG_SOURCE_DICT[row.source]?.tag ?? 'info'"
                size="small"
                effect="plain"
              >
                {{ dictLabel(PRINT_CONFIG_SOURCE_DICT, row.source) }}
              </el-tag>
              <el-tag v-if="row.configured" type="success" size="small" effect="dark">凭据齐备</el-tag>
              <el-tag v-else type="danger" size="small" effect="dark">凭据不全</el-tag>
            </el-space>
          </div>
        </template>

        <div class="provider-card__switch">
          <span class="provider-card__switch-label">平台总开关</span>
          <el-switch
            :model-value="row.enabled"
            :disabled="!canManage || isToggling(row)"
            :loading="isToggling(row)"
            @change="handleToggle(row, switchValue($event))"
          />
          <span class="text-muted">{{ row.enabled ? '已开启' : '已关闭' }}</span>
        </div>

        <el-descriptions :column="1" border size="small" class="provider-card__desc">
          <el-descriptions-item :label="accountLabel(row.provider)">
            <span v-if="row.account" class="table-mono">{{ row.account }}</span>
            <span v-else class="text-muted">未配置</span>
          </el-descriptions-item>
          <el-descriptions-item label="网关地址">
            <span class="table-mono provider-card__url">{{ row.baseUrl }}</span>
            <el-tag v-if="row.baseUrlOverride" type="warning" size="small" effect="plain">
              已覆盖官方地址
            </el-tag>
            <span v-else class="text-muted provider-card__source">官方默认</span>
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ row.updatedAt ? formatDateTime(row.updatedAt) : '尚未在后台保存过' }}
          </el-descriptions-item>
          <el-descriptions-item v-if="row.updatedByName" label="最后修改人">
            {{ row.updatedByName }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="provider-card__secrets">
          <p class="provider-card__subtitle">密钥</p>
          <ul class="secret-list">
            <li
              v-for="secret in row.secretFields"
              :key="secret.name"
              class="secret-list__item"
            >
              <span class="secret-list__label text-ellipsis">{{ secret.label }}</span>
              <el-tag :type="secret.configured ? 'success' : 'info'" size="small" effect="plain">
                {{ secret.configured ? '已配置' : '未配置' }}
              </el-tag>
              <span class="secret-list__fingerprint table-mono">{{ secret.fingerprint || '--' }}</span>
            </li>
          </ul>
        </div>

        <el-alert
          v-if="!row.configured"
          type="error"
          :closable="false"
          show-icon
          class="provider-card__warn"
        >
          <template #title>
            <el-icon class="provider-card__warn-icon"><Warning /></el-icon>
            <span>{{ readinessHint(row) }}</span>
          </template>
        </el-alert>

        <el-alert
          v-if="testResults[row.provider]"
          :type="testResults[row.provider]?.ok ? 'success' : 'error'"
          :closable="false"
          show-icon
          class="provider-card__result"
        >
          <template #title>
            <span>{{ testResults[row.provider]?.message }}</span>
          </template>
          <template #default>
            <span class="provider-card__result-time">
              检测时间 {{ formatDateTime(testResults[row.provider]?.checkedAt) }}
            </span>
          </template>
        </el-alert>

        <template #footer>
          <div class="provider-card__footer">
            <el-button v-if="canManage" text type="primary" @click="openEdit(row)">
              <el-icon><Edit /></el-icon>
              <span>编辑配置</span>
            </el-button>
            <el-button
              v-if="canManage"
              text
              type="primary"
              :loading="isTesting(row)"
              @click="handleTest(row)"
            >
              <el-icon><Connection /></el-icon>
              <span>测试连接</span>
            </el-button>
          </div>
        </template>
      </el-card>

      <el-empty
        v-if="providers.length === 0 && !providersQuery.isFetching.value"
        :description="providersQuery.isError.value ? '暂无厂商，请确认后端服务已启动' : '暂无可配置的厂商'"
        :image-size="80"
      />
    </div>

    <PrintProviderConfigDialog v-model="dialogVisible" :record="editingProvider" />
  </div>
</template>

<style scoped>
.provider-intro {
  margin: 0;
  max-width: 860px;
  font-size: 12px;
  line-height: 1.7;
  color: #909399;
}

.provider-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: stretch;
  min-height: 120px;
}

.provider-card {
  display: flex;
  flex-direction: column;
  flex: 1 1 360px;
  min-width: 340px;
  max-width: 520px;
}

.provider-card :deep(.el-card__body) {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
}

.provider-card__head {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.provider-card__name {
  font-size: 16px;
  font-weight: 600;
}

.provider-card__switch {
  display: flex;
  gap: 10px;
  align-items: center;
}

.provider-card__switch-label {
  font-size: 13px;
  color: #606266;
}

.provider-card__url {
  word-break: break-all;
}

.provider-card__source {
  margin-left: 8px;
  font-size: 12px;
}

.provider-card__subtitle {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
}

.provider-card__secrets {
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

.provider-card__warn,
.provider-card__result {
  margin-top: auto;
}

.provider-card__warn-icon {
  margin-right: 4px;
  vertical-align: -2px;
}

.provider-card__result-time {
  font-size: 12px;
  color: #606266;
}

.provider-card__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
