<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'

import { updateAccount } from '@/api/account'
import { QUERY_KEYS } from '@/api/keys'
import type { PlatformAccount } from '@/api/types/account'
import { confirmFieldRule, passwordRule, requiredRule } from '@/utils/validate'

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{ record: PlatformAccount | null }>()

const queryClient = useQueryClient()
const formRef = ref<FormInstance>()

const form = reactive({
  password: '',
  confirmPassword: '',
})

const targetName = computed(() => props.record?.realName || props.record?.username || '')

const rules: FormRules<typeof form> = {
  password: [requiredRule('请输入新密码'), passwordRule],
  confirmPassword: [requiredRule('请再次输入新密码'), confirmFieldRule(() => form.password)],
}

watch(
  () => visible.value,
  (open) => {
    if (!open) return
    form.password = ''
    form.confirmPassword = ''
    formRef.value?.clearValidate()
  },
)

const resetMutation = useMutation({
  // 后端 PATCH /platform/accounts/{id} 传 password 即为重置密码
  mutationFn: () => updateAccount(props.record?.id ?? 0, { password: form.password }),
  onSuccess: () => {
    ElMessage.success(`已重置「${targetName.value}」的密码`)
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.accounts })
    visible.value = false
  },
})

function handleSubmit(): void {
  formRef.value?.validate((valid) => {
    if (!valid) return
    resetMutation.mutate()
  })
}
</script>

<template>
  <el-dialog v-model="visible" title="重置密码" width="420px" :close-on-click-modal="false">
    <p class="reset-tip">为账号「{{ props.record?.username ?? '--' }}」设置新的登录密码，重置后该账号需重新登录。</p>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="86px">
      <el-form-item label="新密码" prop="password">
        <el-input v-model="form.password" type="password" show-password maxlength="64" placeholder="6-64 位" />
      </el-form-item>
      <el-form-item label="确认密码" prop="confirmPassword">
        <el-input v-model="form.confirmPassword" type="password" show-password maxlength="64" placeholder="请再次输入新密码" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="resetMutation.isPending.value" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.reset-tip {
  margin: 0 0 16px;
  font-size: 13px;
  color: #606266;
}
</style>
