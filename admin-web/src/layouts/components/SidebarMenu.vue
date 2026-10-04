<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'

import { fetchPlatformOverview } from '@/api/dashboard'
import { QUERY_KEYS } from '@/api/keys'
import {
  MENU_FOOTER_ITEMS,
  MENU_SECTIONS,
  type MenuConfigItem,
  type SidebarMenuItem,
} from '@/constants/menu'
import { PERMISSION } from '@/constants/permission'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import SidebarItem from './SidebarItem.vue'

const route = useRoute()
const appStore = useAppStore()
const authStore = useAuthStore()

const collapsed = computed(() => appStore.sidebarCollapsed)

/**
 * 菜单项按权限过滤：叶子项权限不足直接不展示，
 * 分组（如「支付管理」）在其子项全部不可见时整体隐藏。
 */
function toRows(items: readonly MenuConfigItem[]): SidebarMenuItem[] {
  return items.reduce<SidebarMenuItem[]>((list, item) => {
    if (!item.children) {
      if (authStore.hasPermission(item.permissions)) {
        list.push({ path: item.path, title: item.title, icon: item.icon, children: [] })
      }
      return list
    }
    const children = item.children
      .filter((child) => authStore.hasPermission(child.permissions))
      .map<SidebarMenuItem>((child) => ({
        path: child.path,
        title: child.title,
        icon: child.icon,
        children: [],
      }))
    if (children.length > 0) {
      list.push({ path: item.path, title: item.title, icon: item.icon, children })
    }
    return list
  }, [])
}

/** 整组被权限清空时连标题一起去掉，不留空标题 */
const sections = computed(() =>
  MENU_SECTIONS.map((section) => ({ title: section.title, items: toRows(section.items) })).filter(
    (section) => section.items.length > 0,
  ),
)

const footerRows = computed(() => toRows(MENU_FOOTER_ITEMS))

/**
 * 侧栏待办徽标复用的是看板那份 overview：同一个 queryKey，
 * 进看板时不会多发一次请求，看板刷新时侧栏数字跟着变。
 * 没有 dashboard:read 的账号不查（那两个数字本来也不该给所有平台账号看）。
 */
const badgesQuery = useQuery({
  queryKey: QUERY_KEYS.dashboard,
  queryFn: () => fetchPlatformOverview(),
  enabled: computed(() => authStore.can(PERMISSION.dashboardRead)),
})

function badgeOf(path: string): number {
  const data = badgesQuery.data.value
  if (!data) return 0
  if (path === '/merchant') return data.merchantPendingAudit
  if (path === '/expiring') return data.expiringCount
  return 0
}

/** 待审核是「有人在等」，到期是「要出事」，两种紧迫感用不同颜色 */
function badgeToneOf(path: string): 'danger' | 'warning' {
  return path === '/merchant' ? 'warning' : 'danger'
}

const activeMenu = computed(() => {
  const matched = route.matched.find((record) => record.path !== '/')
  return matched?.path ?? route.path
})
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--collapsed': collapsed }">
    <el-menu
      class="sidebar__menu"
      :default-active="activeMenu"
      :collapse="collapsed"
      :collapse-transition="false"
      router
    >
      <el-menu-item-group v-for="section in sections" :key="section.title">
        <template #title>
          <span class="sidebar__group">{{ section.title }}</span>
        </template>
        <SidebarItem
          v-for="item in section.items"
          :key="item.path"
          :item="item"
          :badge="badgeOf(item.path)"
          :badge-tone="badgeToneOf(item.path)"
          :collapsed="collapsed"
        />
      </el-menu-item-group>
    </el-menu>

    <el-menu
      v-if="footerRows.length > 0"
      class="sidebar__menu sidebar__menu--foot"
      :default-active="activeMenu"
      :collapse="collapsed"
      :collapse-transition="false"
      router
    >
      <SidebarItem
        v-for="item in footerRows"
        :key="item.path"
        :item="item"
        :collapsed="collapsed"
      />
    </el-menu>

    <p v-show="!collapsed" class="sidebar__brand">SaaS 多商户点餐系统</p>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: var(--ad-sidebar-width);
  height: 100%;
  overflow-x: hidden;
  background: linear-gradient(180deg, #212d4b 0%, #1b2540 100%);
  transition: width 0.2s ease;
}

.sidebar--collapsed {
  width: var(--ad-sidebar-collapsed-width);
}

.sidebar__menu {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  border-right: none;
}

.sidebar__menu--foot {
  flex: 0 0 auto;
  border-top: 1px solid rgb(255 255 255 / 6%);
}

.sidebar__menu.el-menu:not(.el-menu--collapse) {
  width: calc(var(--ad-sidebar-width) - 8px);
}

.sidebar__menu--foot.el-menu:not(.el-menu--collapse) {
  width: calc(var(--ad-sidebar-width) - 8px);
}

/* 分组标题：小字 + 字距，靠留白与颜色分层，不加分割线 */
.sidebar__menu :deep(.el-menu-item-group__title) {
  padding: 16px 16px 6px;
}

.sidebar__group {
  font-size: 11px;
  letter-spacing: 0.12em;
  color: #6b7896;
}

/* 收起态没有标题空间，标题整块让位给图标 */
.sidebar__menu :deep(.el-menu--collapse .el-menu-item-group__title),
.sidebar--collapsed .sidebar__menu :deep(.el-menu-item-group__title) {
  display: none;
}

.sidebar__brand {
  flex: 0 0 auto;
  margin: 0;
  padding: 10px 16px 12px;
  font-size: 12px;
  color: #5f6c8c;
}
</style>
