import { PERMISSION } from './permission'

/** 侧边菜单图标名，具体组件在 layouts/components/SidebarMenu.vue 里按需注册 */
export type MenuIconName =
  | 'DataLine'
  | 'List'
  | 'Dish'
  | 'Category'
  | 'Activity'
  | 'Promotion'
  | 'Staff'
  | 'Payment'
  | 'Printer'
  | 'Table'
  | 'Store'

export interface MenuConfigItem {
  /** 与 router/routes.ts 中的子路由 path 对应 */
  path: string
  title: string
  icon: MenuIconName
  /** 需要的权限，全部满足才显示；缺省表示登录即可见 */
  permissions?: string[]
}

/** 渲染用的菜单行；商家端没有二级菜单，children 恒为空，与平台端共用同一个侧栏项组件 */
export interface SidebarMenuItem {
  path: string
  title: string
  icon: MenuIconName
  children: SidebarMenuItem[]
}

export interface MenuSection {
  title: string
  items: readonly MenuConfigItem[]
}

/**
 * 主菜单按「这一页是不是每天要点开的」分组：
 * 前厅日常（看数、接单、翻台）在最上，菜品与营销其次。
 */
export const MENU_SECTIONS: readonly MenuSection[] = [
  {
    title: '日常经营',
    items: [
      { path: '/dashboard', title: '数据看板', icon: 'DataLine', permissions: [PERMISSION.dashboardRead] },
      { path: '/order', title: '订单管理', icon: 'List', permissions: [PERMISSION.orderRead] },
      { path: '/table', title: '桌位管理', icon: 'Table', permissions: [PERMISSION.tableRead] },
    ],
  },
  {
    title: '菜品与营销',
    items: [
      { path: '/dish', title: '菜品管理', icon: 'Dish', permissions: [PERMISSION.dishRead] },
      { path: '/category', title: '分类管理', icon: 'Category', permissions: [PERMISSION.categoryRead] },
      { path: '/activity', title: '活动运营位', icon: 'Activity', permissions: [PERMISSION.activityRead] },
      { path: '/promotion', title: '限时活动', icon: 'Promotion', permissions: [PERMISSION.promotionRead] },
    ],
  },
]

/**
 * 低频配置沉到侧栏底部并弱化：员工、收款、打印、门店设置都是配好就不常动的东西，
 * 排在日常动线里只会把「订单」往下推。
 */
export const MENU_FOOTER_ITEMS: readonly MenuConfigItem[] = [
  { path: '/staff', title: '员工管理', icon: 'Staff', permissions: [PERMISSION.staffRead] },
  { path: '/payment', title: '收款设置', icon: 'Payment', permissions: [PERMISSION.paymentRead] },
  { path: '/printer', title: '打印设置', icon: 'Printer', permissions: [PERMISSION.printRead] },
  { path: '/store', title: '门店设置', icon: 'Store', permissions: [PERMISSION.storeRead] },
]
