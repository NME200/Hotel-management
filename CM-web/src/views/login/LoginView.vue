<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Lock, Shop, User } from '@element-plus/icons-vue'

import { ApiError } from '@/api/request'
import { APP_NAME } from '@/constants/api'
import { ROUTE_PATHS, safeRedirectPath } from '@/router/meta'
import { useAuthStore } from '@/stores/auth'
import { passwordRule, requiredRule } from '@/utils/validate'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const formRef = ref<FormInstance>()
const submitting = ref(false)
/** 被守卫挡回来的原因（拿别的端的令牌进本站），进页面时提示一次 */
const deniedTip = ref('')

interface LoginForm {
  merchantCode: string
  username: string
  password: string
}

const form = reactive<LoginForm>({ merchantCode: '', username: '', password: '' })

const rules: FormRules<LoginForm> = {
  merchantCode: [requiredRule('请输入商户编号，如 M10001')],
  username: [requiredRule('请输入员工账号')],
  password: [requiredRule('请输入密码'), passwordRule],
}

const canSubmit = computed(
  () => form.merchantCode.trim() !== '' && form.username.trim() !== '' && form.password !== '',
)

onMounted(() => {
  if (route.query.denied === '1') {
    deniedTip.value = '该账号没有收银台权限，请使用收银员或店长账号登录'
  }
})

async function handleSubmit(): Promise<void> {
  if (submitting.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    const user = await auth.login({
      merchantCode: form.merchantCode.trim(),
      username: form.username.trim(),
      password: form.password,
    })
    ElMessage.success(`欢迎，${user.realName || user.username}`)
    const redirect = safeRedirectPath(route.query.redirect)
    await router.replace(redirect ?? ROUTE_PATHS.home)
  } catch (error) {
    // 后端已经把「没有收银台权限」这类话说清楚了，这里只负责显示；
    // 请求层的全局提示会重复弹一次，所以这里只处理需要额外落位的场景。
    if (error instanceof ApiError && error.status === 403) {
      deniedTip.value = error.message
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login">
    <div class="login__card">
      <div class="login__head">
        <h1 class="login__title">{{ APP_NAME }}</h1>
        <p class="login__sub">用收银员账号登录，开单、收款、打票都在这里</p>
      </div>

      <el-alert
        v-if="deniedTip"
        class="login__alert"
        type="warning"
        :closable="false"
        show-icon
        :title="deniedTip"
      />

      <el-form ref="formRef" :model="form" :rules="rules" size="large" @submit.prevent="handleSubmit">
        <el-form-item prop="merchantCode">
          <el-input v-model="form.merchantCode" placeholder="商户编号，如 M10001" :prefix-icon="Shop" />
        </el-form-item>
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="员工账号" :prefix-icon="User" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            show-password
            :prefix-icon="Lock"
            @keyup.enter="handleSubmit"
          />
        </el-form-item>
        <el-button
          class="login__submit"
          type="primary"
          size="large"
          :loading="submitting"
          :disabled="!canSubmit"
          @click="handleSubmit"
        >
          登录收银台
        </el-button>
      </el-form>

      <p class="login__foot">
        账号与商家端一致，由店长在「员工管理」中创建；只有收银员及以上的角色才能进入收银台。
      </p>
    </div>
  </div>
</template>

<style scoped>
.login {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: linear-gradient(180deg, #1f2a44 0%, #2b3a5c 45%, #f4f6fa 45%, #f4f6fa 100%);
}

.login__card {
  width: 400px;
  padding: 32px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgb(15 23 42 / 18%);
}

.login__head {
  margin-bottom: 20px;
  text-align: center;
}

.login__title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #1f2937;
}

.login__sub {
  margin: 8px 0 0;
  font-size: 13px;
  color: #909399;
}

.login__alert {
  margin-bottom: 16px;
}

.login__submit {
  width: 100%;
  margin-top: 4px;
}

.login__foot {
  margin: 20px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
}
</style>
