<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Lock, Shop, User, UserFilled } from '@element-plus/icons-vue'

import type { LoginPayload } from '@/api/types/auth'
import { APP_NAME } from '@/constants/api'
import { requiredRule } from '@/utils/validate'
import { useAuthStore } from '@/stores/auth'
import { safeRedirectPath } from '@/router/meta'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const formRef = ref<FormInstance>()
const submitting = ref(false)

const form = reactive<LoginPayload>({
  merchantCode: '',
  username: '',
  password: '',
})

const rules: FormRules<LoginPayload> = {
  merchantCode: [requiredRule('请输入商户号')],
  username: [requiredRule('请输入账号')],
  password: [requiredRule('请输入密码')],
}

async function handleSubmit(): Promise<void> {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const user = await authStore.login({
      merchantCode: form.merchantCode.trim(),
      username: form.username.trim(),
      password: form.password,
    })
    ElMessage.success(`欢迎回来，${user.realName || user.username}`)
    const redirect = safeRedirectPath(route.query.redirect)
    await router.replace(redirect ?? '/')
  } catch {
    // 错误提示已由请求层统一处理
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login">
    <div class="login__panel">
      <div class="login__brand">
        <h1 class="login__title">{{ APP_NAME }}</h1>
        <p class="login__desc">SaaS 多商户点餐系统 · 商家端管理后台</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" size="large" @keyup.enter="handleSubmit">
        <el-form-item prop="merchantCode">
          <el-input v-model="form.merchantCode" placeholder="商户号" clearable>
            <template #prefix>
              <el-icon><Shop /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="登录账号" clearable>
            <template #prefix>
              <el-icon><User /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" placeholder="登录密码" show-password>
            <template #prefix>
              <el-icon><Lock /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" class="login__submit" :loading="submitting" @click="handleSubmit">
            登录
          </el-button>
        </el-form-item>
      </el-form>

      <p class="login__tip">
        <el-icon><UserFilled /></el-icon>
        <span>账号由商家管理员在「员工管理」中创建</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.login {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #1f2a44 0%, #33507f 55%, #4f7cff 100%);
}

.login__panel {
  width: 380px;
  padding: 32px 28px 24px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 18px 40px rgb(15 23 42 / 18%);
}

.login__brand {
  margin-bottom: 24px;
  text-align: center;
}

.login__title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 600;
  color: #1f2937;
}

.login__desc {
  margin: 0;
  font-size: 13px;
  color: #909399;
}

.login__submit {
  width: 100%;
}

.login__tip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 4px 0 0;
  font-size: 12px;
  color: #a8abb2;
}
</style>
