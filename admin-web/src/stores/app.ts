import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'

import { STORAGE_KEYS } from '@/constants/api'

export const useAppStore = defineStore('app', () => {
  /** 侧边菜单折叠状态，持久化到 localStorage 提升使用体验 */
  const sidebarCollapsed = useLocalStorage<boolean>(STORAGE_KEYS.sidebarCollapsed, false)

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  return { sidebarCollapsed, toggleSidebar }
})
