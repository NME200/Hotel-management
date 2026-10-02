<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { MENU_ITEMS, type MenuIconName } from '@/constants/menu'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { AlarmClock, Cellphone, Coin, CreditCard, DataLine, DocumentChecked, Money, ScaleToOriginal, Setting, Shop, Tickets, UserFilled, Wallet } from '@element-plus/icons-vue'
import type { Component } from 'vue'

const iconMap: Record<MenuIconName, Component> = {
  DataLine,
  Shop,
  AlarmClock,
  UserFilled,
  Tickets,
  Money,
  CreditCard,
  Wallet,
  Coin,
  ScaleToOriginal,
  DocumentChecked,
  Setting,
  Cellphone,
}

/** 渲染用的扁平行结构：children 为空数组即叶子项，避免模板里出现可选数组的判空 */
interface SidebarMenuItem {
  path: string
  title: string
  icon: MenuIconName
  children: SidebarMenuItem[]
}

const route = useRoute()
const appStore = useAppStore()
const authStore = useAuthStore()

/**
 * 菜单项按权限过滤：叶子项权限不足直接不展示，
 * 分组（如「支付管理」）在其子项全部不可见时整体隐藏。
 */
const visibleMenus = computed<SidebarMenuItem[]>(() =>
  MENU_ITEMS.reduce<SidebarMenuItem[]>((list, item) => {
    if (!item.children) {
      if (authStore.hasPermission(item.permissions)) {
        list.push({ path: item.path, title: item.title, icon: item.icon, children: [] })
      }
      return list
    }
    const children = item.children
      .filter((child) => authStore.hasPermission(child.permissions))
      .map<SidebarMenuItem>((child) => ({ path: child.path, title: child.title, icon: child.icon, children: [] }))
    if (children.length > 0) list.push({ path: item.path, title: item.title, icon: item.icon, children })
    return list
  }, []),
)

const activeMenu = computed(() => {
  const matched = route.matched.find((record) => record.path !== '/')
  return matched?.path ?? route.path
})
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--collapsed': appStore.sidebarCollapsed }">
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
      <template v-for="item in visibleMenus" :key="item.path">
        <el-sub-menu v-if="item.children.length > 0" :index="item.path">
          <template #title>
            <el-icon><component :is="iconMap[item.icon]" /></el-icon>
            <span>{{ item.title }}</span>
          </template>
          <el-menu-item v-for="child in item.children" :key="child.path" :index="child.path">
            <el-icon><component :is="iconMap[child.icon]" /></el-icon>
            <template #title>
              <span>{{ child.title }}</span>
            </template>
          </el-menu-item>
        </el-sub-menu>
        <el-menu-item v-else :index="item.path">
          <el-icon><component :is="iconMap[item.icon]" /></el-icon>
          <template #title>
            <span>{{ item.title }}</span>
          </template>
        </el-menu-item>
      </template>
    </el-menu>
    <p v-show="!appStore.sidebarCollapsed" class="sidebar__foot">SaaS 多商户点餐系统</p>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: var(--ad-sidebar-width);
  height: 100%;
  overflow-x: hidden;
  background: #1f2a44;
  transition: width 0.2s ease;
}

.sidebar--collapsed {
  width: var(--ad-sidebar-collapsed-width);
}

.sidebar__menu {
  flex: 1;
  border-right: none;
}

.sidebar__menu.el-menu:not(.el-menu--collapse) {
  width: calc(var(--ad-sidebar-width) - 8px);
}

/* 子菜单项缩进一级，收起时由 Element Plus 弹出层接管 */
.sidebar__menu :deep(.el-sub-menu .el-menu-item) {
  min-height: 40px;
  font-size: 13px;
}

.sidebar__foot {
  margin: 0;
  padding: 10px 16px;
  font-size: 12px;
  color: #6b7896;
  border-top: 1px solid rgb(255 255 255 / 8%);
}
</style>
