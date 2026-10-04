<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'

import type { SidebarMenuItem } from '@/constants/menu'
import { MENU_ICONS } from './menu-icons'

/**
 * 一条菜单：叶子渲染 el-menu-item，带子项的渲染 el-sub-menu。
 *
 * 徽标分两种形态是必须的 —— 收起态里 `#title` 槽被 Element 隐藏，
 * 数字 pill 放那里等于没有，所以收起时改在图标右上角点一个红点。
 */
const props = withDefaults(
  defineProps<{
    item: SidebarMenuItem
    badge?: number
    badgeTone?: 'danger' | 'warning'
    collapsed?: boolean
  }>(),
  { badge: 0, badgeTone: 'danger', collapsed: false },
)

const isGroup = computed(() => props.item.children.length > 0)
const icon = computed<Component>(() => MENU_ICONS[props.item.icon])
const badgeText = computed(() => (props.badge > 99 ? '99+' : String(props.badge)))
const badgeStyle = computed(() =>
  props.badgeTone === 'warning'
    ? { background: 'rgba(230, 162, 60, 0.18)', color: '#f3b95f', boxShadow: 'inset 0 0 0 1px rgba(230,162,60,.45)' }
    : { background: 'rgba(245, 108, 108, 0.18)', color: '#ff9a9a', boxShadow: 'inset 0 0 0 1px rgba(245,108,108,.45)' },
)
</script>

<template>
  <el-sub-menu v-if="isGroup" :index="item.path">
    <template #title>
      <el-icon class="menu-icon"><component :is="icon" /></el-icon>
      <span class="menu-text">{{ item.title }}</span>
    </template>
    <el-menu-item v-for="child in item.children" :key="child.path" :index="child.path">
      <el-icon class="menu-icon"><component :is="MENU_ICONS[child.icon]" /></el-icon>
      <template #title>
        <span class="menu-text">{{ child.title }}</span>
        <span v-if="badge > 0" class="menu-badge" :style="badgeStyle">{{ badgeText }}</span>
      </template>
    </el-menu-item>
  </el-sub-menu>

  <el-menu-item v-else :index="item.path">
    <el-icon class="menu-icon">
      <component :is="icon" />
      <i v-if="collapsed && badge > 0" class="menu-dot" :class="`menu-dot--${badgeTone}`" />
    </el-icon>
    <template #title>
      <span class="menu-text">{{ item.title }}</span>
      <span v-if="badge > 0" class="menu-badge" :style="badgeStyle">{{ badgeText }}</span>
    </template>
  </el-menu-item>
</template>

<style scoped>
.menu-icon {
  position: relative;
  flex-shrink: 0;
}

.menu-dot {
  position: absolute;
  top: -1px;
  right: -4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.menu-dot--danger {
  background: #f56c6c;
}

.menu-dot--warning {
  background: #e6a23c;
}

.menu-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-badge {
  flex-shrink: 0;
  min-width: 18px;
  height: 17px;
  margin-left: auto;
  padding: 0 5px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  line-height: 17px;
  text-align: center;
  border-radius: 9px;
}
</style>
