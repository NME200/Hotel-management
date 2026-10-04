<script setup lang="ts">
import { computed, ref } from 'vue'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Avatar, Check, Close, Edit, Postcard, Refresh, Search, View } from '@element-plus/icons-vue'

import { fetchCustomers, fetchProfiles, updateCustomerStatus } from '@/api/member'
import { fetchMerchants } from '@/api/merchant'
import { QUERY_KEYS } from '@/api/keys'
import type {
  CustomerListParams,
  CustomerRow,
  MemberLevel,
  MemberProfileRow,
  MemberStatus,
  ProfileListParams,
} from '@/api/types/member'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '@/constants/api'
import {
  MEMBER_LEVEL_DICT,
  MEMBER_LEVEL_OPTIONS,
  MEMBER_STATUS_DICT,
  MEMBER_STATUS_OPTIONS,
  REGISTER_SOURCE_DICT,
  dictLabel,
  dictTagType,
} from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { formatCount, formatMoney } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import PaginationBar from '@/components/common/PaginationBar.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import TimeText from '@/components/common/TimeText.vue'
import CustomerDetailDrawer from './components/CustomerDetailDrawer.vue'
import ProfileEditDialog from './components/ProfileEditDialog.vue'

const authStore = useAuthStore()
const queryClient = useQueryClient()

const canRead = computed(() => authStore.can(PERMISSION.platformMemberRead))
const canManage = computed(() => authStore.can(PERMISSION.platformMemberManage))

/** 两层数据各一个 tab，筛选与分页互不干扰 */
const activeTab = ref<'customers' | 'profiles'>('customers')

const keyword = ref('')
const customerStatus = ref<MemberStatus | undefined>()
const customerPage = ref(DEFAULT_PAGE)
const customerPageSize = ref(DEFAULT_PAGE_SIZE)

const merchantId = ref<number | undefined>()
const level = ref<MemberLevel | undefined>()
const profileStatus = ref<MemberStatus | undefined>()
const profilePage = ref(DEFAULT_PAGE)
const profilePageSize = ref(DEFAULT_PAGE_SIZE)

const drawerVisible = ref(false)
const detailCustomerId = ref<number | null>(null)
const editVisible = ref(false)
const editingProfile = ref<MemberProfileRow | null>(null)

const customerParams = computed<CustomerListParams>(() => ({
  keyword: keyword.value.trim() || undefined,
  status: customerStatus.value,
  page: customerPage.value,
  pageSize: customerPageSize.value,
}))

const profileParams = computed<ProfileListParams>(() => ({
  merchantId: merchantId.value,
  level: level.value,
  status: profileStatus.value,
  page: profilePage.value,
  pageSize: profilePageSize.value,
}))

const customerQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.platformMembers, 'customers', customerParams.value]),
  queryFn: () => fetchCustomers(customerParams.value),
  enabled: computed(() => canRead.value && activeTab.value === 'customers'),
  placeholderData: keepPreviousData,
})

const profileQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.platformMemberProfiles, profileParams.value]),
  queryFn: () => fetchProfiles(profileParams.value),
  enabled: computed(() => canRead.value && activeTab.value === 'profiles'),
  placeholderData: keepPreviousData,
})

/** 商户筛选的下拉源：只在「门店档案」页要用，接口单页最多 100 家，超出靠 filterable 在本页内检索 */
const merchantOptionsQuery = useQuery({
  queryKey: [...QUERY_KEYS.merchants, 'options'],
  queryFn: () => fetchMerchants({ page: 1, pageSize: 100 }),
  enabled: computed(
    () => activeTab.value === 'profiles' && authStore.can(PERMISSION.merchantRead),
  ),
  staleTime: 5 * 60 * 1000,
})

const customerRows = computed<CustomerRow[]>(() => customerQuery.data.value?.list ?? [])
const customerTotal = computed(() => customerQuery.data.value?.total ?? 0)
const profileRows = computed<MemberProfileRow[]>(() => profileQuery.data.value?.list ?? [])
const profileTotal = computed(() => profileQuery.data.value?.total ?? 0)

const customerStatusMutation = useMutation({
  mutationFn: (variables: { id: number; status: MemberStatus }) =>
    updateCustomerStatus(variables.id, variables.status),
  onSuccess: (_data, variables) => {
    ElMessage.success(
      variables.status === 'active' ? '该顾客账号已恢复' : '该顾客已在所有门店被停用',
    )
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.platformMembers })
  },
})

function openDetail(customerId: number): void {
  detailCustomerId.value = customerId
  drawerVisible.value = true
}

function openEditProfile(row: MemberProfileRow): void {
  editingProfile.value = row
  editVisible.value = true
}

/** 停用写在 customer 上：一家店都下不了单，所以确认文案必须把范围说死 */
async function confirmCustomerStatus(row: CustomerRow, next: MemberStatus): Promise<void> {
  if (!canManage.value) {
    ElMessage.warning('没有会员管理权限')
    return
  }
  const title = next === 'active' ? '恢复账号' : '停用账号'
  const detail =
    next === 'active'
      ? `确认恢复「${row.nickname}」的微信账号？恢复后他在 ${row.storeCount} 家门店重新可以下单（单店档案单独停用的仍受该店限制）。`
      : `确认停用「${row.nickname}」的微信账号？这是平台级停用：该顾客在全部 ${row.storeCount} 家门店都无法下单，各店的余额与等级保留，恢复后即原样可用。`
  try {
    await ElMessageBox.confirm(detail, title, {
      type: 'warning',
      confirmButtonText: '确认',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  customerStatusMutation.mutate({ id: row.id, status: next })
}

function handleSearch(): void {
  if (activeTab.value === 'customers') customerPage.value = DEFAULT_PAGE
  else profilePage.value = DEFAULT_PAGE
}

/** 重置只清当前页的筛选：另一组的筛选项此刻不在界面上 */
function handleReset(): void {
  if (activeTab.value === 'customers') {
    keyword.value = ''
    customerStatus.value = undefined
    customerPage.value = DEFAULT_PAGE
    return
  }
  merchantId.value = undefined
  level.value = undefined
  profileStatus.value = undefined
  profilePage.value = DEFAULT_PAGE
}

function refreshCurrent(): void {
  if (activeTab.value === 'customers') void customerQuery.refetch()
  else void profileQuery.refetch()
}

/** 刷新按钮的转圈状态跟着当前 tab 的那个查询 */
const currentFetching = computed(() =>
  activeTab.value === 'customers' ? customerQuery.isFetching.value : profileQuery.isFetching.value,
)
</script>

<template>
  <div class="page-container">
    <div class="page-card">
      <div class="page-toolbar">
        <el-space wrap :size="12">
          <el-input
            v-if="activeTab === 'customers'"
            v-model="keyword"
            placeholder="昵称 / 手机号 / openid"
            clearable
            class="toolbar-input"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-select
            v-if="activeTab === 'customers'"
            v-model="customerStatus"
            placeholder="全部状态"
            clearable
            class="toolbar-select"
            @change="handleSearch"
          >
            <el-option v-for="item in MEMBER_STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-select
            v-else
            v-model="merchantId"
            placeholder="全部门店"
            clearable
            filterable
            class="toolbar-select toolbar-select--wide"
            @change="handleSearch"
          >
            <el-option
              v-for="item in merchantOptionsQuery.data.value?.list ?? []"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            >
              <span>{{ item.name }}</span>
              <span class="table-sub-text table-mono option-code">{{ item.code }}</span>
            </el-option>
          </el-select>
          <el-select
            v-if="activeTab === 'profiles'"
            v-model="level"
            placeholder="全部等级"
            clearable
            class="toolbar-select"
            @change="handleSearch"
          >
            <el-option v-for="item in MEMBER_LEVEL_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-select
            v-if="activeTab === 'profiles'"
            v-model="profileStatus"
            placeholder="全部状态"
            clearable
            class="toolbar-select"
            @change="handleSearch"
          >
            <el-option v-for="item in MEMBER_STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-space>
        <el-button :loading="currentFetching" @click="refreshCurrent">
          <el-icon><Refresh /></el-icon>
          <span>刷新</span>
        </el-button>
      </div>

      <el-tabs v-model="activeTab" class="member-tabs">
        <el-tab-pane name="customers">
          <template #label>
            <span class="member-tab-label"><el-icon><Avatar /></el-icon> 顾客账号</span>
          </template>
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="顾客账号 = 一个微信身份，跨全部门店；这里的停用会让该顾客在任何一家店都下不了单。等级、余额等门店数据请看「门店档案」。"
            class="member-alert"
          />
          <el-table
            v-loading="customerQuery.isFetching.value"
            :data="customerRows"
            border
            stripe
            row-key="id"
            class="member-table"
          >
            <el-table-column label="顾客" min-width="200">
              <template #default="{ row }: { row: CustomerRow }">
                <div class="cell-customer">
                  <el-avatar v-if="row.avatar" :size="36" :src="row.avatar" />
                  <el-avatar v-else :size="36" class="cell-customer__avatar">{{ row.nickname.slice(0, 1) }}</el-avatar>
                  <div class="cell-text">
                    <span class="text-ellipsis">{{ row.nickname || '未命名顾客' }}</span>
                    <p class="table-sub-text">
                      ID {{ row.id }} · {{ dictLabel(REGISTER_SOURCE_DICT, row.registerSource) }}
                    </p>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="手机号" width="150">
              <template #default="{ row }: { row: CustomerRow }">
                <span v-if="row.phoneMasked" class="table-mono">{{ row.phoneMasked }}</span>
                <span v-else class="text-muted">未绑定手机号</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }: { row: CustomerRow }">
                <StatusTag :item="MEMBER_STATUS_DICT[row.status]" />
              </template>
            </el-table-column>
            <el-table-column label="开通门店" width="100" align="center">
              <template #default="{ row }: { row: CustomerRow }">{{ formatCount(row.storeCount) }} 家</template>
            </el-table-column>
            <el-table-column label="累计订单" width="100" align="center">
              <template #default="{ row }: { row: CustomerRow }">{{ formatCount(row.orderCount) }} 单</template>
            </el-table-column>
            <el-table-column label="最近下单" width="130">
              <template #default="{ row }: { row: CustomerRow }">
                <TimeText :value="row.lastOrderAt" mode="date" placeholder="暂无" />
              </template>
            </el-table-column>
            <el-table-column label="注册时间" width="170">
              <template #default="{ row }: { row: CustomerRow }"><TimeText :value="row.createdAt" /></template>
            </el-table-column>
            <el-table-column label="操作" width="210" fixed="right" align="right">
              <template #default="{ row }: { row: CustomerRow }">
                <el-button text type="primary" @click="openDetail(row.id)">
                  <el-icon><View /></el-icon>
                  <span>查看详情</span>
                </el-button>
                <el-button
                  v-if="canManage && row.status === 'active'"
                  text
                  type="danger"
                  :disabled="customerStatusMutation.isPending.value"
                  @click="confirmCustomerStatus(row, 'disabled')"
                >
                  <el-icon><Close /></el-icon>
                  <span>停用</span>
                </el-button>
                <el-button
                  v-if="canManage && row.status !== 'active'"
                  text
                  type="success"
                  :disabled="customerStatusMutation.isPending.value"
                  @click="confirmCustomerStatus(row, 'active')"
                >
                  <el-icon><Check /></el-icon>
                  <span>恢复</span>
                </el-button>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty
                :description="customerQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '暂无顾客账号'"
                :image-size="80"
              />
            </template>
          </el-table>

          <PaginationBar v-model:page="customerPage" v-model:page-size="customerPageSize" :total="customerTotal" />
        </el-tab-pane>

        <el-tab-pane name="profiles">
          <template #label>
            <span class="member-tab-label"><el-icon><Postcard /></el-icon> 门店档案</span>
          </template>
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="一个顾客在每家店各一份档案：等级、成长值、积分与余额都属于那一家店，这里改的也只那一家。"
            class="member-alert"
          />
          <el-table
            v-loading="profileQuery.isFetching.value"
            :data="profileRows"
            border
            stripe
            row-key="id"
            class="member-table"
          >
            <el-table-column label="顾客昵称" min-width="160">
              <template #default="{ row }: { row: MemberProfileRow }">
                <div class="cell-text">
                  <el-button class="cell-link" text type="primary" @click="openDetail(row.customerId)">
                    <span class="text-ellipsis">{{ row.nickname || '未命名顾客' }}</span>
                  </el-button>
                  <p class="table-sub-text">账号 ID {{ row.customerId }}</p>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="所属商户" min-width="180">
              <template #default="{ row }: { row: MemberProfileRow }">
                <div class="cell-text">
                  <span class="text-ellipsis">{{ row.merchantName }}</span>
                  <p class="table-sub-text table-mono">{{ row.merchantCode }}</p>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="等级" width="110" align="center">
              <template #default="{ row }: { row: MemberProfileRow }">
                <el-tag :type="dictTagType(MEMBER_LEVEL_DICT, row.level)" size="small" effect="light">
                  {{ row.levelLabel }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="成长值" width="100" align="center">
              <template #default="{ row }: { row: MemberProfileRow }">{{ formatCount(row.growthValue) }}</template>
            </el-table-column>
            <el-table-column label="积分" width="90" align="center">
              <template #default="{ row }: { row: MemberProfileRow }">{{ formatCount(row.points) }}</template>
            </el-table-column>
            <el-table-column label="余额" width="110" align="right">
              <template #default="{ row }: { row: MemberProfileRow }">{{ formatMoney(row.balance) }}</template>
            </el-table-column>
            <el-table-column label="累计消费" width="120" align="right">
              <template #default="{ row }: { row: MemberProfileRow }">{{ formatMoney(row.totalAmount) }}</template>
            </el-table-column>
            <el-table-column label="订单数" width="90" align="center">
              <template #default="{ row }: { row: MemberProfileRow }">{{ formatCount(row.orderCount) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90" align="center">
              <template #default="{ row }: { row: MemberProfileRow }">
                <StatusTag :item="MEMBER_STATUS_DICT[row.status]" />
              </template>
            </el-table-column>
            <el-table-column label="备注" min-width="150">
              <template #default="{ row }: { row: MemberProfileRow }">
                <span v-if="row.remark" class="text-ellipsis" :title="row.remark">{{ row.remark }}</span>
                <span v-else class="text-muted">无</span>
              </template>
            </el-table-column>
            <el-table-column label="最近下单" width="120">
              <template #default="{ row }: { row: MemberProfileRow }">
                <TimeText :value="row.lastOrderAt" mode="date" placeholder="暂无" />
              </template>
            </el-table-column>
            <el-table-column v-if="canManage" label="操作" width="120" fixed="right" align="right">
              <template #default="{ row }: { row: MemberProfileRow }">
                <el-button text type="primary" @click="openEditProfile(row)">
                  <el-icon><Edit /></el-icon>
                  <span>编辑档案</span>
                </el-button>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty
                :description="profileQuery.isError.value ? '暂无数据，请确认后端服务已启动' : '暂无会员档案'"
                :image-size="80"
              />
            </template>
          </el-table>

          <PaginationBar v-model:page="profilePage" v-model:page-size="profilePageSize" :total="profileTotal" />
        </el-tab-pane>
      </el-tabs>
    </div>

    <CustomerDetailDrawer v-model="drawerVisible" :customer-id="detailCustomerId" />
    <ProfileEditDialog v-model="editVisible" :profile="editingProfile" />
  </div>
</template>

<style scoped>
.toolbar-input {
  width: 220px;
}

.toolbar-select {
  width: 140px;
}

.toolbar-select--wide {
  width: 200px;
}

.member-alert {
  margin-bottom: 12px;
}

.member-tabs {
  padding: 0 16px;
}

.member-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}

.member-tab-label {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.member-table {
  width: 100%;
}

.cell-customer {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.cell-customer__avatar {
  font-size: 15px;
  background: #4f7cff;
}

.cell-link {
  height: auto;
  padding: 0;
  justify-content: flex-start;
}

.option-code {
  float: right;
  margin-left: 12px;
}
</style>
