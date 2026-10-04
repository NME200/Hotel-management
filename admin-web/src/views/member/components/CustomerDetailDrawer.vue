<script setup lang="ts">
import { computed, ref } from 'vue'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Close, Edit, User } from '@element-plus/icons-vue'

import { fetchCustomerDetail, updateMemberProfile } from '@/api/member'
import { QUERY_KEYS } from '@/api/keys'
import type { MemberProfileRow, MemberStatus } from '@/api/types/member'
import {
  MEMBER_GENDER_DICT,
  MEMBER_LEVEL_DICT,
  MEMBER_STATUS_DICT,
  REGISTER_SOURCE_DICT,
  dictLabel,
  dictTagType,
} from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { formatCount, formatDateTime, formatMoney } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import StatusTag from '@/components/common/StatusTag.vue'
import TimeText from '@/components/common/TimeText.vue'
import ProfileEditDialog from './ProfileEditDialog.vue'

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{ customerId: number | null }>()

const authStore = useAuthStore()
const queryClient = useQueryClient()

const canManage = computed(() => authStore.can(PERMISSION.platformMemberManage))

const editVisible = ref(false)
const editingProfile = ref<MemberProfileRow | null>(null)

/** 详情接口一次给到账号 + 各店档案，这里不再发第二个请求 */
const detailQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.platformMemberDetail, props.customerId ?? 0]),
  queryFn: () => fetchCustomerDetail(props.customerId ?? 0),
  enabled: computed(() => visible.value && props.customerId !== null),
  placeholderData: keepPreviousData,
})

const customer = computed(() => detailQuery.data.value ?? null)
const profiles = computed<MemberProfileRow[]>(() => customer.value?.profiles ?? [])

const profileMutation = useMutation({
  mutationFn: (variables: { id: number; status: MemberStatus }) =>
    updateMemberProfile(variables.id, { status: variables.status }),
  onSuccess: (_data, variables) => {
    ElMessage.success(
      `已${variables.status === 'active' ? '恢复' : '停用'}这家店的会员档案`,
    )
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.platformMembers })
  },
})

async function confirmProfileStatus(row: MemberProfileRow, next: MemberStatus): Promise<void> {
  if (!canManage.value) {
    ElMessage.warning('没有会员管理权限')
    return
  }
  const title = next === 'active' ? '恢复档案' : '停用档案'
  const detail =
    next === 'active'
      ? `确认恢复「${row.nickname}」在「${row.merchantName}」的会员身份？恢复后这一家重新认他的等级与余额。`
      : `确认停用「${row.nickname}」在「${row.merchantName}」的会员身份？只关闭这一家店，他在别的店与账号本身都不受影响。`
  try {
    await ElMessageBox.confirm(detail, title, {
      type: 'warning',
      confirmButtonText: '确认',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  profileMutation.mutate({ id: row.id, status: next })
}

function openEditProfile(row: MemberProfileRow): void {
  editingProfile.value = row
  editVisible.value = true
}

/** 手机号在列表只给掩码，详情这层是后台工具，直接给完整号码 */
function phoneText(value: string | null): string {
  return value || '未绑定手机号'
}
</script>

<template>
  <el-drawer v-model="visible" title="顾客详情" size="920px" direction="rtl" destroy-on-close>
    <div v-loading="detailQuery.isFetching.value" class="customer-detail">
      <template v-if="customer">
        <div class="customer-detail__head">
          <el-avatar v-if="customer.avatar" :size="46" :src="customer.avatar" />
          <el-avatar v-else :size="46" class="customer-detail__avatar">
            <el-icon><User /></el-icon>
          </el-avatar>
          <div class="customer-detail__title">
            <p class="customer-detail__name">{{ customer.nickname || '未命名顾客' }}</p>
            <p class="table-sub-text">账号 ID {{ customer.id }}</p>
          </div>
          <div class="customer-detail__tags">
            <StatusTag :item="MEMBER_STATUS_DICT[customer.status]" size="default" />
          </div>
        </div>

        <el-descriptions :column="2" border size="small" class="customer-detail__desc">
          <el-descriptions-item label="手机号">{{ phoneText(customer.phone) }}</el-descriptions-item>
          <el-descriptions-item label="性别">{{ dictLabel(MEMBER_GENDER_DICT, customer.gender) }}</el-descriptions-item>
          <el-descriptions-item label="账号状态">
            <StatusTag :item="MEMBER_STATUS_DICT[customer.status]" />
          </el-descriptions-item>
          <el-descriptions-item label="注册来源">
            {{ dictLabel(REGISTER_SOURCE_DICT, customer.registerSource) }}
          </el-descriptions-item>
          <el-descriptions-item label="注册时间">{{ formatDateTime(customer.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="最近下单">
            <TimeText :value="customer.lastOrderAt" placeholder="暂无下单" />
          </el-descriptions-item>
          <el-descriptions-item label="开通门店">{{ formatCount(customer.storeCount) }} 家</el-descriptions-item>
          <el-descriptions-item label="累计订单">{{ formatCount(customer.orderCount) }} 单</el-descriptions-item>
          <el-descriptions-item label="头像" :span="2">
            <el-image
              v-if="customer.avatar"
              :src="customer.avatar"
              fit="cover"
              :preview-src-list="[customer.avatar]"
              preview-teleported
              class="customer-detail__avatar-img"
            />
            <span v-else class="text-muted">未设置头像</span>
          </el-descriptions-item>
        </el-descriptions>

        <el-alert
          v-if="customer.status === 'disabled'"
          type="warning"
          :closable="false"
          show-icon
          title="该账号已被平台停用，在以下所有门店都无法下单；恢复请到「顾客账号」列表操作"
          class="customer-detail__alert"
        />

        <h4 class="customer-detail__subtitle">各店会员档案</h4>
        <el-table v-loading="detailQuery.isFetching.value" :data="profiles" border stripe size="small">
          <el-table-column label="门店" min-width="180">
            <template #default="{ row }: { row: MemberProfileRow }">
              <div class="cell-text">
                <span class="text-ellipsis">{{ row.merchantName }}</span>
                <p class="table-sub-text table-mono">{{ row.merchantCode }}</p>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="等级" width="100" align="center">
            <template #default="{ row }: { row: MemberProfileRow }">
              <el-tag :type="dictTagType(MEMBER_LEVEL_DICT, row.level)" size="small" effect="light">
                {{ row.levelLabel }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="成长值 / 积分" width="120" align="center">
            <template #default="{ row }: { row: MemberProfileRow }">
              <div class="cell-text cell-text--center">
                <span>{{ formatCount(row.growthValue) }}</span>
                <p class="table-sub-text">{{ formatCount(row.points) }} 积分</p>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="余额" width="110" align="right">
            <template #default="{ row }: { row: MemberProfileRow }">{{ formatMoney(row.balance) }}</template>
          </el-table-column>
          <el-table-column label="累计消费" width="130" align="right">
            <template #default="{ row }: { row: MemberProfileRow }">
              <div class="cell-text cell-text--right">
                <span>{{ formatMoney(row.totalAmount) }}</span>
                <p class="table-sub-text">{{ formatCount(row.orderCount) }} 单</p>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }: { row: MemberProfileRow }">
              <StatusTag :item="MEMBER_STATUS_DICT[row.status]" />
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="140">
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
          <el-table-column v-if="canManage" label="操作" width="170" fixed="right" align="right">
            <template #default="{ row }: { row: MemberProfileRow }">
              <el-button text type="primary" @click="openEditProfile(row)">
                <el-icon><Edit /></el-icon>
                <span>编辑</span>
              </el-button>
              <el-button
                v-if="row.status === 'active'"
                text
                type="danger"
                :disabled="profileMutation.isPending.value"
                @click="confirmProfileStatus(row, 'disabled')"
              >
                <el-icon><Close /></el-icon>
                <span>停用</span>
              </el-button>
              <el-button
                v-else
                text
                type="success"
                :disabled="profileMutation.isPending.value"
                @click="confirmProfileStatus(row, 'active')"
              >
                <el-icon><Check /></el-icon>
                <span>恢复</span>
              </el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="该顾客还没有任何门店档案" :image-size="60" />
          </template>
        </el-table>
      </template>

      <el-empty
        v-else-if="!detailQuery.isFetching.value"
        :description="detailQuery.isError.value ? '顾客加载失败，请确认后端服务已启动' : '暂无顾客'"
        :image-size="80"
      />
    </div>

    <ProfileEditDialog v-model="editVisible" :profile="editingProfile" />
  </el-drawer>
</template>

<style scoped>
.customer-detail {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.customer-detail__head {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.customer-detail__avatar {
  font-size: 18px;
  background: #4f7cff;
}

.customer-detail__title {
  flex: 1;
  min-width: 0;
}

.customer-detail__name {
  margin: 0 0 2px;
  font-size: 17px;
  font-weight: 600;
}

.customer-detail__tags {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  align-items: center;
}

.customer-detail__desc {
  margin-bottom: 16px;
}

.customer-detail__avatar-img {
  width: 56px;
  height: 56px;
  border-radius: 6px;
}

.customer-detail__alert {
  margin-bottom: 16px;
}

.customer-detail__subtitle {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
}

.cell-text--right {
  align-items: flex-end;
}

.cell-text--center {
  align-items: center;
}
</style>
