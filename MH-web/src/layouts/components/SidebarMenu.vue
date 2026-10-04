<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { Shop } from '@element-plus/icons-vue'

import { fetchOrders } from '@/api/order'
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

function toRows(items: readonly MenuConfigItem[]): SidebarMenuItem[] {
  return items
    .filter((item) => authStore.hasPermission(item.permissions))
    .map<SidebarMenuItem>((item) => ({ path: item.path, title: item.title, icon: item.icon, children: [] }))
}

/** 整组被权限清空时连标题一起去掉：后厨只有一两项可见时不该看到一排空标题 */
const sections = computed(() =>
  MENU_SECTIONS.map((section) => ({ title: section.title, items: toRows(section.items) })).filter(
    (section) => section.items.length > 0,
  ),
)

const footerRows = computed(() => toRows(MENU_FOOTER_ITEMS))

/**
 * 「订单管理」上的待接单数。
 *
 * 取列表接口的 total 而不是看板接口的 pendingOrderCount：
 * 后厨与服务员没有 dashboard:read，用看板那份数据他们永远看不到这个提醒，
 * 而待接单恰恰是他们最该看到的一个数。pageSize=1 只要总数。
 */
const pendingQuery = useQuery({
  queryKey: computed(() => [...QUERY_KEYS.orders, 'pending-count']),
  queryFn: () => fetchOrders({ status: 'pending', page: 1, pageSize: 1 }),
  enabled: computed(() => authStore.can(PERMISSION.orderRead)),
})

function badgeOf(path: string): number {
  if (path === '/order') return pendingQuery.data.value?.total ?? 0
  return 0
}

const activeMenu = computed(() => {
  const matched = route.matched.find((record) => record.path !== '/')
  return matched?.path ?? route.path
})
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--collapsed': collapsed }">
    <div class="sidebar__logo">
      <el-icon :size="22" color="#7f9dff"><Shop /></el-icon>
      <span v-show="!collapsed" class="sidebar__title text-ellipsis">
        {{ authStore.merchantName || '商家中心' }}
      </span>
    </div>

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
      <SidebarItem v-for="item in footerRows" :key="item.path" :item="item" :collapsed="collapsed" />
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
  background: linear-gradient(180deg, #212d4b 0%, #1b2540 100%);
  transition: width 0.2s ease;
}

.sidebar--collapsed {
  width: var(--mh-sidebar-collapsed-width);
}

.sidebar__logo {
  display: flex;
  flex: 0 0 auto;
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
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  border-right: none;
}

/* 底部低频区：项数固定，不参与 flex 伸缩，始终贴在窗口下沿 */
.sidebar__menu--foot {
  flex: 0 0 auto;
  border-top: 1px solid rgb(255 255 255 / 6%);
}

.sidebar__menu.el-menu:not(.el-menu--collapse),
.sidebar__menu--foot.el-menu:not(.el-menu--collapse) {
  width: calc(var(--mh-sidebar-width) - 8px);
}

.sidebar__menu :deep(.el-menu--collapse .el-menu-item-group__title),
.sidebar--collapsed .sidebar__menu :deep(.el-menu-item-group__title) {
  display: none;
}
</style>
