<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { ArrowDown, Expand, Fold, Key, SwitchButton, User } from '@element-plus/icons-vue'

import { STAFF_ROLE_DICT, dictLabel } from '@/constants/dictionary'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import AppBreadcrumb from './AppBreadcrumb.vue'
import ChangePasswordDialog from './ChangePasswordDialog.vue'

const router = useRouter()
const appStore = useAppStore()
const authStore = useAuthStore()

const passwordDialogVisible = ref(false)

async function handleCommand(command: string): Promise<void> {
  if (command === 'password') {
    passwordDialogVisible.value = true
    return
  }
  if (command === 'logout') {
    try {
      await ElMessageBox.confirm('确认退出当前登录？', '退出登录', {
        type: 'warning',
        confirmButtonText: '退出',
        cancelButtonText: '取消',
      })
    } catch {
      return
    }
    await authStore.logout()
    await router.replace('/login')
  }
}
</script>

<template>
  <header class="header">
    <div class="header__left">
      <el-button text class="header__collapse" @click="appStore.toggleSidebar()">
        <el-icon :size="18">
          <Fold v-if="!appStore.sidebarCollapsed" />
          <Expand v-else />
        </el-icon>
      </el-button>
      <AppBreadcrumb />
    </div>

    <div class="header__right">
      <el-tag v-if="authStore.merchantName" type="info" effect="plain" size="small">
        {{ authStore.merchantName }}
      </el-tag>
      <el-tag v-if="authStore.user" type="success" effect="plain" size="small">
        {{ dictLabel(STAFF_ROLE_DICT, authStore.user.role) }}
      </el-tag>
      <el-dropdown trigger="click" @command="handleCommand">
        <span class="header__user">
          <el-icon :size="16"><User /></el-icon>
          <span class="text-ellipsis">{{ authStore.displayName }}</span>
          <el-icon :size="12"><ArrowDown /></el-icon>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="password">
              <el-icon><Key /></el-icon>
              <span>修改密码</span>
            </el-dropdown-item>
            <el-dropdown-item divided command="logout">
              <el-icon><SwitchButton /></el-icon>
              <span>退出登录</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <ChangePasswordDialog v-model="passwordDialogVisible" />
  </header>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--mh-header-height);
  padding: 0 16px;
  background: #fff;
  border-bottom: 1px solid #e9edf5;
}

.header__left,
.header__right {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.header__collapse {
  padding: 4px 8px;
}

.header__user {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 180px;
  padding: 4px 8px;
  color: #1f2937;
  border-radius: 6px;
  outline: none;
  cursor: pointer;
}

.header__user:hover {
  background: #f4f6fa;
}
</style>
