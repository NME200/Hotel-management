import type { Component } from 'vue'
import {
  Coordinate,
  DataLine,
  Dish,
  Discount,
  Grid,
  List,
  Money,
  PriceTag,
  Printer,
  Shop,
  User,
} from '@element-plus/icons-vue'
import type { MenuIconName } from '@/constants/menu'

/**
 * 菜单图标只在这里注册一次：侧栏与侧栏项子组件都按 `MenuIconName` 取组件，
 * 写两处会漏配。
 */
export const MENU_ICONS: Record<MenuIconName, Component> = {
  DataLine,
  List,
  Dish,
  Category: Grid,
  Activity: Discount,
  Promotion: PriceTag,
  Staff: User,
  Payment: Money,
  Printer,
  // 桌位用 Coordinate：四个角加中心点，正好是一张桌子俯视图的样子
  Table: Coordinate,
  Store: Shop,
}
