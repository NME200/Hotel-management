<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'

import { createStaff, updateStaff } from '@/api/staff'
import { QUERY_KEYS } from '@/api/keys'
import type { Staff, StaffRole, StaffStatus } from '@/api/types/staff'
import { STAFF_ROLE_OPTIONS, STAFF_STATUS_OPTIONS } from '@/constants/dictionary'
import { passwordRule, phoneRule, requiredRule } from '@/utils/validate'

const visible = defineModel<boolean>({ required: true })

const props = defineProps<{ record: Staff | null }>()

const queryClient = useQueryClient()
const formRef = ref<FormInstance>()

const form = reactive({
  username: '',
  password: '',
  realName: '',
  phone: '',
  role: 'waiter' as StaffRole,
  status: 'active' as StaffStatus,
})

const isEdit = computed(() => props.record !== null)
const dialogTitle = computed(() => (isEdit.value ? '编辑员工' : '新增员工'))

const rules = computed<FormRules<typeof form>>(() => ({
  username: [requiredRule('请输入登录账号')],
  password: isEdit.value ? [] : [requiredRule('请输入初始密码'), passwordRule],
  realName: [requiredRule('请输入员工姓名')],
  role: [requiredRule('请选择角色')],
  phone: [phoneRule],
}))

watch(
  () => [visible.value, props.record] as const,
  ([open]) => {
    if (!open) return
    if (props.record) {
      Object.assign(form, {
        username: props.record.username,
        password: '',
        realName: props.record.realName,
        phone: props.record.phone ?? '',
        role: props.record.role,
        status: props.record.status,
      })
    } else {
      Object.assign(form, {
        username: '',
        password: '',
        realName: '',
        phone: '',
        role: 'waiter' as StaffRole,
        status: 'active' as StaffStatus,
      })
    }
    formRef.value?.clearValidate()
  },
  { immediate: true },
)

const saveMutation = useMutation({
  mutationFn: () => {
    if (props.record) {
      return updateStaff(props.record.id, {
        realName: form.realName.trim(),
        phone: form.phone.trim(),
        role: form.role,
        status: form.status,
      })
    }
    return createStaff({
      username: form.username.trim(),
      password: form.password,
      realName: form.realName.trim(),
      phone: form.phone.trim() || undefined,
      role: form.role,
      status: form.status,
    })
  },
  onSuccess: () => {
    ElMessage.success(isEdit.value ? '员工信息已更新' : '员工已创建')
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.staffs })
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
  <el-dialog v-model="visible" :title="dialogTitle" width="480px" :close-on-click-modal="false">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
      <el-form-item label="登录账号" prop="username">
        <el-input v-model="form.username" :disabled="isEdit" maxlength="30" placeholder="登录用的账号" />
      </el-form-item>
      <el-form-item v-if="!isEdit" label="初始密码" prop="password">
        <el-input v-model="form.password" type="password" show-password maxlength="32" placeholder="6-32 位" />
      </el-form-item>
      <el-form-item label="员工姓名" prop="realName">
        <el-input v-model="form.realName" maxlength="20" placeholder="真实姓名" />
      </el-form-item>
      <el-form-item label="手机号" prop="phone">
        <el-input v-model="form.phone" maxlength="11" placeholder="可选，11 位手机号" />
      </el-form-item>
      <el-form-item label="角色" prop="role">
        <el-select v-model="form.role" class="full-width" placeholder="请选择角色">
          <el-option v-for="item in STAFF_ROLE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="状态" prop="status">
        <el-radio-group v-model="form.status">
          <el-radio-button v-for="item in STAFF_STATUS_OPTIONS" :key="item.value" :value="item.value">
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saveMutation.isPending.value" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.full-width {
  width: 100%;
}
</style>
