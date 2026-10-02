<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useMutation } from '@tanstack/vue-query'

import { changePassword } from '@/api/auth'
import { ROUTE_PATHS } from '@/router/meta'
import { useAuthStore } from '@/stores/auth'
import { confirmFieldRule, passwordRule, requiredRule } from '@/utils/validate'

const visible = defineModel<boolean>({ required: true })

const authStore = useAuthStore()
const router = useRouter()
const formRef = ref<FormInstance>()

const form = reactive({
  oldPassword: '',
  password: '',
  confirmPassword: '',
})

const rules: FormRules<typeof form> = {
  oldPassword: [requiredRule('请输入当前密码')],
  password: [requiredRule('请输入新密码'), passwordRule],
  confirmPassword: [requiredRule('请再次输入新密码'), confirmFieldRule(() => form.password)],
}

const passwordMutation = useMutation({
  // 改密后后端已作废当前会话，前端只需清理本地状态并回到登录页
  mutationFn: () => changePassword({ oldPassword: form.oldPassword, newPassword: form.password }),
  onSuccess: () => {
    ElMessage.success('密码修改成功，请使用新密码重新登录')
    visible.value = false
    authStore.clearSession()
    void router.replace(ROUTE_PATHS.login)
  },
})

function handleSubmit(): void {
  formRef.value?.validate((valid) => {
    if (!valid) return
    passwordMutation.mutate()
  })
}

function resetForm(): void {
  form.oldPassword = ''
  form.password = ''
  form.confirmPassword = ''
  formRef.value?.clearValidate()
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="修改密码"
    width="420px"
    append-to-body
    :close-on-click-modal="false"
    @closed="resetForm"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="86px">
      <el-form-item label="当前密码" prop="oldPassword">
        <el-input
          v-model="form.oldPassword"
          type="password"
          show-password
          maxlength="64"
          placeholder="请输入当前密码"
        />
      </el-form-item>
      <el-form-item label="新密码" prop="password">
        <el-input v-model="form.password" type="password" show-password maxlength="64" placeholder="6-64 位" />
      </el-form-item>
      <el-form-item label="确认密码" prop="confirmPassword">
        <el-input
          v-model="form.confirmPassword"
          type="password"
          show-password
          maxlength="64"
          placeholder="请再次输入新密码"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="passwordMutation.isPending.value" @click="handleSubmit">
        确定
      </el-button>
    </template>
  </el-dialog>
</template>
