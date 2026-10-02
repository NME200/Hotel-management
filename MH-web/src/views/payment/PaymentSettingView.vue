<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { Refresh } from '@element-plus/icons-vue'

import { fetchPaymentConfigs } from '@/api/payment'
import { QUERY_KEYS } from '@/api/keys'
import type { MerchantPaymentConfigItem, PaymentChannel } from '@/api/types/payment'
import { PAYMENT_CHANNEL_ORDER } from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { useAuthStore } from '@/stores/auth'
import PaymentApplyDrawer from './components/PaymentApplyDrawer.vue'
import PaymentChannelCard from './components/PaymentChannelCard.vue'

const authStore = useAuthStore()
const queryClient = useQueryClient()

const drawerVisible = ref(false)
const drawerReadonly = ref(false)
const activeChannel = ref<PaymentChannel | null>(null)

const configsQuery = useQuery({
  queryKey: QUERY_KEYS.paymentConfigs,
  queryFn: () => fetchPaymentConfigs(),
  enabled: computed(() => authStore.can(PERMISSION.paymentRead)),
})

const canApply = computed(() => authStore.can(PERMISSION.paymentApply))

/** 后端固定返回三条渠道配置，前端不自行补渠道，只保证展示顺序稳定 */
const configs = computed<MerchantPaymentConfigItem[]>(() => {
  const list = configsQuery.data.value ?? []
  return [...list].sort(
    (a, b) => PAYMENT_CHANNEL_ORDER.indexOf(a.channel) - PAYMENT_CHANNEL_ORDER.indexOf(b.channel),
  )
})

const activeConfig = computed<MerchantPaymentConfigItem | null>(
  () => configs.value.find((item) => item.channel === activeChannel.value) ?? null,
)

function openApply(config: MerchantPaymentConfigItem): void {
  activeChannel.value = config.channel
  drawerReadonly.value = false
  drawerVisible.value = true
}

function openView(config: MerchantPaymentConfigItem): void {
  activeChannel.value = config.channel
  drawerReadonly.value = true
  drawerVisible.value = true
}

function handleRefresh(): void {
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.paymentConfigs })
}
</script>

<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-toolbar">
        <div class="payment-head">
          <p class="payment-head__title">收款设置</p>
          <p class="payment-head__desc text-muted">
            微信支付走服务商模式：商户自备特约商户号并提交进件资料，平台运营审核通过后开通；渠道密钥全部由平台保管。
          </p>
        </div>
        <el-button :loading="configsQuery.isFetching.value" @click="handleRefresh">
          <el-icon><Refresh /></el-icon>
          <span>刷新</span>
        </el-button>
      </div>

      <div v-loading="configsQuery.isPending.value" class="page-body">
        <el-alert
          v-if="!canApply"
          class="payment-alert"
          type="info"
          :closable="false"
          show-icon
          title="当前账号仅可查看收款状态，如需提交或修改进件资料请开通 payment:apply 权限"
        />

        <el-row v-if="configs.length > 0" :gutter="16" class="payment-grid">
          <el-col v-for="item in configs" :key="item.channel" :xs="24" :sm="12" :lg="8" class="payment-col">
            <PaymentChannelCard :config="item" :can-apply="canApply" @apply="openApply" @view="openView" />
          </el-col>
        </el-row>

        <el-empty
          v-else-if="!configsQuery.isPending.value"
          :description="configsQuery.isError.value ? '暂无收款渠道数据，请确认后端服务已启动' : '暂无收款渠道数据'"
          :image-size="80"
        />
      </div>
    </div>

    <PaymentApplyDrawer v-model="drawerVisible" :config="activeConfig" :readonly="drawerReadonly" />
  </div>
</template>

<style scoped>
.payment-head {
  min-width: 0;
}

.payment-head__title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
}

.payment-head__desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}

.payment-alert {
  margin-bottom: 16px;
}

.payment-grid {
  align-items: stretch;
}

.payment-col {
  margin-bottom: 16px;
}
</style>
