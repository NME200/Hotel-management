<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'

import { updateMemberProfile } from '@/api/member'
import { QUERY_KEYS } from '@/api/keys'
import type { MemberProfileRow, MemberStatus } from '@/api/types/member'
import { MEMBER_STATUS_OPTIONS } from '@/constants/dictionary'

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{ profile: MemberProfileRow | null }>()

const queryClient = useQueryClient()
const formRef = ref<FormInstance>()

const form = reactive({
  remark: '',
  status: 'active' as MemberStatus,
})

const rules = computed<FormRules<typeof form>>(() => ({
  status: [{ required: true, message: '请选择该店的会员状态', trigger: 'change' }],
}))

const profileText = computed(() => {
  const profile = props.profile
  if (!profile) return ''
  return `${profile.nickname} @ ${profile.merchantName}（${profile.merchantCode}）`
})

/** 这里的「停用」只关这一家店：账号级停用要去顾客账号页，两件事别混 */
const alertTitle = computed(() =>
  form.status === 'disabled'
    ? '停用只关闭这一家店的会员身份，他在别的店照常下单'
    : '备注与启停都属于这家店的档案，不会同步到该顾客的其他门店',
)

watch(
  () => [visible.value, props.profile] as const,
  ([open, profile]) => {
    if (!open || !profile) return
    Object.assign(form, { remark: profile.remark ?? '', status: profile.status })
    formRef.value?.clearValidate()
  },
  { immediate: true },
)

const saveMutation = useMutation({
  mutationFn: () =>
    updateMemberProfile(props.profile?.id ?? 0, {
      remark: form.remark.trim(),
      status: form.status,
    }),
  onSuccess: () => {
    ElMessage.success('会员档案已更新')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.platformMembers })
    visible.value = false
  },
})

function handleSubmit(): void {
  formRef.value?.validate((valid) => {
    if (!valid) return
    saveMutation.mutate()
  })
}
</script>

<template>
  <el-dialog v-model="visible" title="编辑会员档案" width="480px" append-to-body :close-on-click-modal="false">
    <p v-if="profileText" class="profile-edit__who">{{ profileText }}</p>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="门店备注">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="3"
          maxlength="255"
          show-word-limit
          placeholder="这家店给这位顾客的备注，留空即清除"
        />
      </el-form-item>
      <el-form-item label="本档案" prop="status">
        <el-radio-group v-model="form.status">
          <el-radio-button v-for="item in MEMBER_STATUS_OPTIONS" :key="item.value" :value="item.value">
            {{ item.value === 'active' ? '启用' : '停用' }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>
    </el-form>

    <el-alert type="info" :closable="false" show-icon :title="alertTitle" class="profile-edit__alert" />

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saveMutation.isPending.value" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.profile-edit__who {
  margin: 0 0 14px;
  font-size: 13px;
  font-weight: 600;
}

.profile-edit__alert {
  margin-top: 4px;
}
</style>
