<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { MENU_ITEMS, type MenuIconName } from '@/constants/menu'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import {
  DataLine,
  Dish,
  Discount,
  Grid,
  List,
  Money,
  PriceTag,
  Shop,
  User,
  UserFilled,
} from '@element-plus/icons-vue'
import type { Component } from 'vue'

const iconMap: Record<MenuIconName, Component> = {
  DataLine,
  List,
  Dish,
  Category: Grid,
  Activity: Discount,
  Promotion: PriceTag,
  Member: UserFilled,
  Staff: User,
  Payment: Money,
  Store: Shop,
}

const route = useRoute()
const appStore = useAppStore()
const authStore = useAuthStore()

/** 菜单项按权限过滤，权限不足的模块直接不展示 */
const visibleMenus = computed(() => MENU_ITEMS.filter((item) => authStore.hasPermission(item.permissions)))

const activeMenu = computed(() => {
  const matched = route.matched.find((record) => record.path !== '/')
  return matched?.path ?? route.path
})
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--collapsed': appStore.sidebarCollapsed }">
    <div class="sidebar__logo">
      <el-icon :size="22" color="#4f7cff"><Shop /></el-icon>
      <span v-show="!appStore.sidebarCollapsed" class="sidebar__title text-ellipsis">
        {{ authStore.merchantName || '商家中心' }}
      </span>
    </div>
    <el-menu
      :default-active="activeMenu"
      :collapse="appStore.sidebarCollapsed"
      :collapse-transition="false"
      router
      class="sidebar__menu"
      background-color="#1f2a44"
      text-color="#c3cbe0"
      active-text-color="#ffffff"
    >
      <el-menu-item v-for="item in visibleMenus" :key="item.path" :index="item.path">
        <el-icon><component :is="iconMap[item.icon]" /></el-icon>
        <template #title>
          <span>{{ item.title }}</span>
        </template>
      </el-menu-item>
    </el-menu>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: var(--mh-sidebar-width);
  height: 100%;
  overflow-x: hidden;
  background: #1f2a44;
  transition: width 0.2s ease;
}

.sidebar--collapsed {
  width: var(--mh-sidebar-collapsed-width);
}

.sidebar__logo {
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--mh-header-height);
  padding: 0 16px;
  color: #fff;
  border-bottom: 1px solid rgb(255 255 255 / 8%);
}

.sidebar__title {
  font-size: 15px;
  font-weight: 600;
}

.sidebar__menu {
  flex: 1;
  border-right: none;
}

.sidebar__menu.el-menu:not(.el-menu--collapse) {
  width: calc(var(--mh-sidebar-width) - 8px);
}
</style>
