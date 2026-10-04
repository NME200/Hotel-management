<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Goods, List, SwitchButton, Wallet } from '@element-plus/icons-vue'

import { STAFF_ROLE_LABELS } from '@/api/types/auth'
import { APP_NAME } from '@/constants/api'
import { PERMISSION } from '@/constants/permission'
import { ROUTE_PATHS } from '@/router/meta'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

/** 导航项按权限过滤：没有开单权限的账号（例如只来收银）不该看到「点单收银」 */
const navItems = computed(() =>
  [
    { path: '/cashier', label: '点单收银', icon: Wallet, permission: PERMISSION.orderCreate },
    { path: '/tables', label: '桌位看板', icon: Goods, permission: PERMISSION.tableRead },
    { path: '/orders', label: '今日订单', icon: List, permission: PERMISSION.orderRead },
  ].filter((item) => auth.can(item.permission)),
)

const roleText = computed(() => STAFF_ROLE_LABELS[auth.user?.role ?? 'cashier'] ?? auth.roleLabel)

async function handleLogout(): Promise<void> {
  try {
    await ElMessageBox.confirm('确认退出收银台？', '退出登录', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  await auth.logout()
  void router.replace(ROUTE_PATHS.login)
}
</script>

<template>
  <div class="layout">
    <header class="topbar">
      <div class="topbar__brand">
        <span class="topbar__app">{{ APP_NAME }}</span>
        <span class="topbar__store text-ellipsis">{{ auth.merchantName || '--' }}</span>
      </div>

      <nav class="topbar__nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ 'nav-item--active': route.path === item.path }"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="topbar__user">
        <span class="topbar__who">
          {{ auth.displayName }}
          <span class="topbar__role">{{ roleText }}</span>
        </span>
        <el-button text :icon="SwitchButton" @click="handleLogout">退出</el-button>
      </div>
    </header>

    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 24px;
  height: var(--cm-header-height);
  padding: 0 16px;
  color: #fff;
  background: #1f2a44;
  flex-shrink: 0;
}

.topbar__brand {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  max-width: 260px;
}

.topbar__app {
  font-size: 16px;
  font-weight: 600;
}

.topbar__store {
  font-size: 13px;
  color: #c3cbe0;
}

.topbar__nav {
  display: flex;
  flex: 1;
  gap: 6px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--cm-radius);
  font-size: 14px;
  color: #c3cbe0;
  transition: background 0.15s ease;
}

.nav-item:hover {
  background: rgb(255 255 255 / 8%);
}

.nav-item--active {
  color: #fff;
  background: var(--cm-brand);
}

.topbar__user {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.topbar__who {
  font-size: 13px;
  color: #c3cbe0;
}

.topbar__role {
  margin-left: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: #fff;
  background: rgb(255 255 255 / 16%);
}

.topbar__user :deep(.el-button) {
  color: #c3cbe0;
}

.content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
