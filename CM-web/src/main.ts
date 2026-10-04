import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { registerUnauthorizedHandler } from './api/request'
import router from './router'
import { ROUTE_PATHS } from './router/meta'
import { useAuthStore } from './stores/auth'
import './style.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // 4xx 属于业务失败，重试无意义；仅对网络类错误重试一次
      retry: (failureCount, error) => {
        const status = (error as { status?: number | null }).status
        if (typeof status === 'number' && status >= 400 && status < 500) return false
        return failureCount < 1
      },
    },
    mutations: {
      retry: false,
    },
  },
})

const app = createApp(App)

app.use(createPinia())
app.use(VueQueryPlugin, { queryClient })
app.use(router)
// Element Plus 整体引入，配置集中、便于维护；图标在各组件内按需局部注册
app.use(ElementPlus)

// token 失效时由请求层回调：清理登录态并跳转登录页（在这里 import router / stores 不会形成循环依赖）
registerUnauthorizedHandler(() => {
  const auth = useAuthStore()
  auth.clearSession()
  const current = router.currentRoute.value
  if (current.path === ROUTE_PATHS.login) return
  void router.replace({ path: ROUTE_PATHS.login, query: { redirect: current.fullPath } })
})

app.mount('#app')
