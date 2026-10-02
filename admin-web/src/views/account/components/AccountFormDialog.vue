<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'

import { createAccount, updateAccount } from '@/api/account'
import { QUERY_KEYS } from '@/api/keys'
import type { PlatformAccount, AccountStatus } from '@/api/types/account'
import type { PlatformRole } from '@/api/types/auth'
import { ACCOUNT_STATUS_OPTIONS, PLATFORM_ROLE_OPTIONS } from '@/constants/dictionary'
import {
  confirmFieldRule,
  lengthRule,
  passwordRule,
  phoneRule,
  requiredRule,
  usernameRule,
} from '@/utils/validate'
import { useAuthStore } from '@/stores/auth'

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{ record: PlatformAccount | null }>()

const authStore = useAuthStore()
const queryClient = useQueryClient()
const formRef = ref<FormInstance>()

const form = reactive({
  username: '',
  password: '',
  confirmPassword: '',
  realName: '',
  phone: '',
  role: 'platform_operator' as PlatformRole,
  status: 'active' as AccountStatus,
})

const isEdit = computed(() => props.record !== null)
const dialogTitle = computed(() => (isEdit.value ? '编辑平台账号' : '新增平台账号'))

const rules = computed<FormRules<typeof form>>(() => ({
  username: isEdit.value ? [] : [requiredRule('请输入登录账号'), usernameRule],
  password: isEdit.value ? [] : [requiredRule('请输入初始密码'), passwordRule],
  confirmPassword: isEdit.value ? [] : [requiredRule('请再次输入初始密码'), confirmFieldRule(() => form.password)],
  realName: [requiredRule('请输入姓名'), lengthRule(2, 64, '姓名')],
  phone: [phoneRule],
  role: [requiredRule('请选择角色')],
}))

watch(
  () => [visible.value, props.record] as const,
  ([open]) => {
    if (!open) return
    if (props.record) {
      Object.assign(form, {
        username: props.record.username,
        password: '',
        confirmPassword: '',
        realName: props.record.realName,
        phone: props.record.phone ?? '',
        role: props.record.role,
        status: props.record.status,
      })
    } else {
      Object.assign(form, {
        username: '',
        password: '',
        confirmPassword: '',
        realName: '',
        phone: '',
        role: 'platform_operator' as PlatformRole,
        status: 'active' as AccountStatus,
      })
    }
    formRef.value?.clearValidate()
  },
  { immediate: true },
)

const saveMutation = useMutation({
  mutationFn: () => {
    const phone = form.phone.trim()
    if (props.record) {
      // 手机号留空时不提交该字段，避免后端对可选 phone 的空串校验失败
      return updateAccount(props.record.id, {
        realName: form.realName.trim(),
        ...(phone ? { phone } : {}),
        role: form.role,
        status: form.status,
      })
    }
    return createAccount({
      username: form.username.trim(),
      password: form.password,
      realName: form.realName.trim(),
      phone: phone || undefined,
      role: form.role,
    })
  },
  onSuccess: () => {
    ElMessage.success(isEdit.value ? '平台账号已更新' : '平台账号已创建')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.accounts })
    visible.value = false
  },
})

function handleSubmit(): void {
  formRef.value?.validate((valid) => {
    if (!valid) return
    saveMutation.mutate()
  })
}

/** 编辑自己时给出提示：后端不允许把最后一个超级管理员降级或禁用 */
const selfHint = computed(() => isEdit.value && props.record?.id === authStore.user?.id)
</script>

<template>
  <el-dialog v-model="visible" :title="dialogTitle" width="480px" :close-on-click-modal="false">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
      <el-form-item label="登录账号" prop="username">
        <el-input v-model="form.username" :disabled="isEdit" maxlength="32" placeholder="3-32 位字母、数字或下划线" />
      </el-form-item>
      <el-form-item v-if="!isEdit" label="初始密码" prop="password">
        <el-input v-model="form.password" type="password" show-password maxlength="64" placeholder="6-64 位" />
      </el-form-item>
      <el-form-item v-if="!isEdit" label="确认密码" prop="confirmPassword">
        <el-input
          v-model="form.confirmPassword"
          type="password"
          show-password
          maxlength="64"
          placeholder="请再次输入初始密码"
        />
      </el-form-item>
      <el-form-item label="姓名" prop="realName">
        <el-input v-model="form.realName" maxlength="64" placeholder="真实姓名" />
      </el-form-item>
      <el-form-item label="手机号" prop="phone">
        <el-input v-model="form.phone" maxlength="11" placeholder="可选，11 位手机号" />
      </el-form-item>
      <el-form-item label="角色" prop="role">
        <el-select v-model="form.role" class="full-width" placeholder="请选择角色">
          <el-option v-for="item in PLATFORM_ROLE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="isEdit" label="状态" prop="status">
        <el-radio-group v-model="form.status">
          <el-radio-button v-for="item in ACCOUNT_STATUS_OPTIONS" :key="item.value" :value="item.value">
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>
    </el-form>

    <el-alert
      v-if="selfHint"
      type="info"
      :closable="false"
      show-icon
      title="修改自己的账号信息后，请用新信息重新登录"
      class="dialog-alert"
    />
    <el-alert
      v-else-if="isEdit"
      type="warning"
      :closable="false"
      show-icon
      title="系统会拒绝把最后一个超级管理员降级或禁用"
      class="dialog-alert"
    />

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saveMutation.isPending.value" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.dialog-alert {
  margin-top: 4px;
}
</style>
