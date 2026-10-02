<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'

import { resetStaffPassword } from '@/api/staff'
import type { Staff } from '@/api/types/staff'
import { confirmFieldRule, passwordRule, requiredRule } from '@/utils/validate'

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{ staff: Staff | null }>()

const emit = defineEmits<{ done: [] }>()

const formRef = ref<FormInstance>()
const submitting = ref(false)

const form = reactive({ password: '', confirmPassword: '' })

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

async function handleSubmit(): Promise<void> {
  if (!props.staff || !formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    await resetStaffPassword(props.staff.id, form.password)
    ElMessage.success(`已重置 ${props.staff.realName || props.staff.username} 的密码`)
    visible.value = false
    emit('done')
  } catch {
    // 错误提示已由请求层统一处理
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="重置密码" width="440px" :close-on-click-modal="false">
    <p class="reset-tip">
      正在为账号
      <strong>{{ staff?.username ?? '--' }}</strong>
      （{{ staff?.realName || '--' }}）重置登录密码，重置后请及时通知员工。
    </p>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="86px">
      <el-form-item label="新密码" prop="password">
        <el-input v-model="form.password" type="password" show-password maxlength="32" placeholder="6-32 位" />
      </el-form-item>
      <el-form-item label="确认密码" prop="confirmPassword">
        <el-input v-model="form.confirmPassword" type="password" show-password maxlength="32" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
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
