<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import { fetchMerchantDetail } from '@/api/merchant'
import { QUERY_KEYS } from '@/api/keys'
import { MERCHANT_STATUS_DICT, STORE_STATUS_DICT } from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { formatCount, formatDate, formatDateTime } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import StatusTag from '@/components/common/StatusTag.vue'
import StatisticsTab from './StatisticsTab.vue'
import DishTab from './DishTab.vue'
import OrderTab from './OrderTab.vue'
import MemberTab from './MemberTab.vue'
import StaffTab from './StaffTab.vue'

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{ merchantId: number | null }>()

const authStore = useAuthStore()

const detailQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.merchantDetail, props.merchantId ?? 0]),
  queryFn: () => fetchMerchantDetail(props.merchantId ?? 0),
  enabled: computed(() => visible.value && props.merchantId !== null),
})

const merchant = computed(() => detailQuery.data.value ?? null)
const store = computed(() => merchant.value?.store ?? null)
const canViewInsight = computed(() => authStore.can(PERMISSION.merchantView))

/** 到期时间：空表示不限期 */
const expireText = computed(() => {
  const value = merchant.value?.expireAt
  if (!value) return '不限期'
  return formatDate(value)
})

/** 营业时段数组的可读文本 */
const businessHoursText = computed(() => {
  const hours = store.value?.businessHours ?? []
  return hours.length > 0 ? hours.join('、') : '未设置'
})

/** 门店地址：省市区 + 详细地址 */
const storeAddress = computed(() => {
  if (!store.value) return '--'
  const parts = [store.value.province, store.value.city, store.value.district, store.value.address].filter(
    (item): item is string => Boolean(item),
  )
  return parts.length > 0 ? parts.join('') : '未填写'
})
</script>

<template>
  <el-drawer v-model="visible" title="商户详情" size="920px" direction="rtl" destroy-on-close>
    <div v-loading="detailQuery.isFetching.value" class="merchant-detail">
      <template v-if="merchant">
        <div class="merchant-detail__head">
          <el-avatar v-if="merchant.logo" :size="46" :src="merchant.logo" shape="square" />
          <el-avatar v-else :size="46" shape="square" class="merchant-detail__avatar">{{ merchant.name.slice(0, 1) }}</el-avatar>
          <div class="merchant-detail__title">
            <p class="merchant-detail__name">{{ merchant.name }}</p>
            <p class="table-sub-text table-mono">{{ merchant.code }}</p>
          </div>
          <div class="merchant-detail__tags">
            <StatusTag :item="MERCHANT_STATUS_DICT[merchant.status]" size="default" />
            <el-tag v-if="!merchant.expireAt" type="info" effect="plain" size="default">不限期</el-tag>
          </div>
        </div>

        <el-descriptions :column="2" border size="small" class="merchant-detail__desc">
          <el-descriptions-item label="联系人">{{ merchant.contactName }}</el-descriptions-item>
          <el-descriptions-item label="联系电话">{{ merchant.contactPhone }}</el-descriptions-item>
          <el-descriptions-item label="门店名称">{{ merchant.storeName || '未创建门店' }}</el-descriptions-item>
          <el-descriptions-item label="员工数">{{ formatCount(merchant.staffCount) }} 人</el-descriptions-item>
          <el-descriptions-item label="到期时间">{{ expireText }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDateTime(merchant.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ formatDateTime(merchant.updatedAt) }}</el-descriptions-item>
          <el-descriptions-item label="审核时间">
            {{ merchant.auditedAt ? formatDateTime(merchant.auditedAt) : '未审核' }}
          </el-descriptions-item>
          <el-descriptions-item label="审核备注" :span="2">
            {{ merchant.auditRemark || '无' }}
          </el-descriptions-item>
          <el-descriptions-item label="商户备注" :span="2">{{ merchant.remark || '无' }}</el-descriptions-item>
        </el-descriptions>

        <template v-if="store">
          <h4 class="merchant-detail__subtitle">门店信息</h4>
          <el-descriptions :column="2" border size="small" class="merchant-detail__desc">
            <el-descriptions-item label="门店名称">{{ store.name }}</el-descriptions-item>
            <el-descriptions-item label="营业状态">
              <StatusTag :item="STORE_STATUS_DICT[store.status]" />
            </el-descriptions-item>
            <el-descriptions-item label="联系电话">{{ store.phone || '未填写' }}</el-descriptions-item>
            <el-descriptions-item label="营业时段">{{ businessHoursText }}</el-descriptions-item>
            <el-descriptions-item label="门店地址" :span="2">{{ storeAddress }}</el-descriptions-item>
            <el-descriptions-item label="门店公告" :span="2">{{ store.notice || '无' }}</el-descriptions-item>
          </el-descriptions>
        </template>
        <el-alert
          v-else-if="!detailQuery.isFetching.value"
          type="info"
          :closable="false"
          show-icon
          title="该商户暂无门店信息"
          class="merchant-detail__alert"
        />

        <h4 class="merchant-detail__subtitle">商户数据（只读）</h4>
        <el-alert
          v-if="!canViewInsight"
          type="warning"
          :closable="false"
          show-icon
          title="当前账号缺少 platform:merchant:view 权限，无法查看商户业务数据"
          class="merchant-detail__alert"
        />
        <el-tabs v-else type="border-card" class="merchant-detail__tabs">
          <el-tab-pane label="经营数据" name="statistics" lazy>
            <StatisticsTab :merchant-id="merchant.id" />
          </el-tab-pane>
          <el-tab-pane label="菜品" name="dishes" lazy>
            <DishTab :merchant-id="merchant.id" />
          </el-tab-pane>
          <el-tab-pane label="订单" name="orders" lazy>
            <OrderTab :merchant-id="merchant.id" />
          </el-tab-pane>
          <el-tab-pane label="会员" name="members" lazy>
            <MemberTab :merchant-id="merchant.id" />
          </el-tab-pane>
          <el-tab-pane label="员工" name="staffs" lazy>
            <StaffTab :merchant-id="merchant.id" />
          </el-tab-pane>
        </el-tabs>
      </template>

      <el-empty
        v-else-if="!detailQuery.isFetching.value"
        :description="detailQuery.isError.value ? '商户加载失败，请确认后端服务已启动' : '暂无商户'"
        :image-size="80"
      />
    </div>
  </el-drawer>
</template>

<style scoped>
.merchant-detail {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.merchant-detail__head {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.merchant-detail__avatar {
  font-size: 18px;
  background: #4f7cff;
}

.merchant-detail__title {
  min-width: 0;
  flex: 1;
}

.merchant-detail__name {
  margin: 0 0 2px;
  font-size: 17px;
  font-weight: 600;
}

.merchant-detail__tags {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  align-items: center;
}

.merchant-detail__desc {
  margin-bottom: 16px;
}

.merchant-detail__subtitle {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
}

.merchant-detail__alert {
  margin-bottom: 16px;
}

.merchant-detail__tabs :deep(.el-tabs__content) {
  padding: 12px;
}
</style>
