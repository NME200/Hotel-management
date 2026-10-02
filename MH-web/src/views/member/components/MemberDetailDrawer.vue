<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, type FormInstance } from 'element-plus'

import { fetchMemberDetail, updateMember } from '@/api/member'
import { QUERY_KEYS } from '@/api/keys'
import type { MemberLevel, MemberStatus } from '@/api/types/member'
import {
  MEMBER_GENDER_DICT,
  MEMBER_LEVEL_OPTIONS,
  MEMBER_STATUS_OPTIONS,
  dictLabel,
} from '@/constants/dictionary'
import { PERMISSION } from '@/constants/permission'
import { formatDateTime, formatMoney } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{ memberId: number | null }>()

const authStore = useAuthStore()
const queryClient = useQueryClient()
const formRef = ref<FormInstance>()

const form = reactive({
  remark: '',
  level: 'normal' as MemberLevel,
  status: 'active' as MemberStatus,
})

const canEdit = computed(() => authStore.can(PERMISSION.memberUpdate))

const detailQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.members, 'detail', props.memberId ?? 0]),
  queryFn: () => fetchMemberDetail(props.memberId ?? 0),
  enabled: computed(() => visible.value && props.memberId !== null),
})

const member = computed(() => detailQuery.data.value ?? null)

watch(
  () => detailQuery.data.value,
  (data) => {
    if (!data) return
    form.remark = data.remark ?? ''
    form.level = data.level
    form.status = data.status
    formRef.value?.clearValidate()
  },
  { immediate: true },
)

const saveMutation = useMutation({
  mutationFn: (payload: { id: number; remark: string; level: MemberLevel; status: MemberStatus }) =>
    updateMember(payload.id, { remark: payload.remark, level: payload.level, status: payload.status }),
  onSuccess: () => {
    ElMessage.success('会员信息已更新')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.members })
  },
})

function handleSave(): void {
  if (!member.value) return
  saveMutation.mutate({
    id: member.value.id,
    remark: form.remark.trim(),
    level: form.level,
    status: form.status,
  })
}
</script>

<template>
  <el-drawer v-model="visible" title="会员详情" size="600px" direction="rtl">
    <div v-loading="detailQuery.isFetching.value">
      <template v-if="member">
        <div class="member-head">
          <el-avatar :size="52" :src="member.avatar" />
          <div class="member-head__text">
            <p class="member-head__name">{{ member.nickname || '未命名会员' }}</p>
            <p class="text-muted">{{ member.phone || '未绑定手机号' }}</p>
          </div>
        </div>

        <el-descriptions :column="2" border class="member-desc">
          <el-descriptions-item label="会员 ID">{{ member.id }}</el-descriptions-item>
          <el-descriptions-item label="性别">{{ dictLabel(MEMBER_GENDER_DICT, member.gender) }}</el-descriptions-item>
          <el-descriptions-item label="积分">{{ member.points }}</el-descriptions-item>
          <el-descriptions-item label="余额">{{ formatMoney(member.balance) }}</el-descriptions-item>
          <el-descriptions-item label="累计消费">{{ formatMoney(member.totalAmount) }}</el-descriptions-item>
          <el-descriptions-item label="订单数">{{ member.orderCount }}</el-descriptions-item>
          <el-descriptions-item label="最近下单">
            {{ member.lastOrderAt ? formatDateTime(member.lastOrderAt) : '暂无' }}
          </el-descriptions-item>
          <el-descriptions-item label="注册时间">{{ formatDateTime(member.createdAt) }}</el-descriptions-item>
        </el-descriptions>

        <h4 class="member-title">会员维护</h4>
        <el-form ref="formRef" :model="form" label-width="80px" :disabled="!canEdit">
          <el-form-item label="等级" prop="level">
            <el-select v-model="form.level" class="full-width">
              <el-option
                v-for="item in MEMBER_LEVEL_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="状态" prop="status">
            <el-radio-group v-model="form.status">
              <el-radio-button
                v-for="item in MEMBER_STATUS_OPTIONS"
                :key="item.value"
                :value="item.value"
              >
                {{ item.label }}
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="商家备注" prop="remark">
            <el-input
              v-model="form.remark"
              type="textarea"
              :rows="4"
              maxlength="200"
              show-word-limit
              placeholder="如：忌口、常点菜品、联系方式备注"
            />
          </el-form-item>
        </el-form>

        <div class="member-footer">
          <el-button
            type="primary"
            :disabled="!canEdit"
            :loading="saveMutation.isPending.value"
            @click="handleSave"
          >
            保存
          </el-button>
        </div>
      </template>

      <el-empty
        v-else-if="!detailQuery.isFetching.value"
        :description="detailQuery.isError.value ? '会员加载失败，请确认后端服务已启动' : '暂无会员'"
        :image-size="80"
      />
    </div>
  </el-drawer>
</template>

<style scoped>
.member-head {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.member-head__name {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 600;
}

.member-head__text {
  min-width: 0;
}

.member-desc {
  margin-bottom: 20px;
}

.member-title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
}

.member-footer {
  display: flex;
  justify-content: flex-end;
}

.full-width {
  width: 100%;
}
</style>
