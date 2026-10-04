import type { Component } from 'vue'
import {
  AlarmClock,
  Cellphone,
  Coin,
  CreditCard,
  DataLine,
  DocumentChecked,
  Message,
  Money,
  Postcard,
  Printer,
  ScaleToOriginal,
  Setting,
  Shop,
  Tickets,
  UserFilled,
  Wallet,
} from '@element-plus/icons-vue'
import type { MenuIconName } from '@/constants/menu'

/**
 * 菜单图标只在这里注册一次。
 * 侧栏与侧栏项子组件都要按 `MenuIconName` 取组件，放两处会漏配。
 */
export const MENU_ICONS: Record<MenuIconName, Component> = {
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
  Postcard,
  Printer,
  Message,
}
