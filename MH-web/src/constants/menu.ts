import { PERMISSION } from './permission'

/** 侧边菜单图标名，具体组件在 layouts/components/SidebarMenu.vue 里按需注册 */
export type MenuIconName =
  | 'DataLine'
  | 'List'
  | 'Dish'
  | 'Category'
  | 'Activity'
  | 'Promotion'
  | 'Member'
  | 'Staff'
  | 'Payment'
  | 'Store'

export interface MenuConfigItem {
  /** 与 router/routes.ts 中的子路由 path 对应 */
  path: string
  title: string
  icon: MenuIconName
  /** 需要的权限，全部满足才显示；缺省表示登录即可见 */
  permissions?: string[]
}

export const MENU_ITEMS: readonly MenuConfigItem[] = [
  { path: '/dashboard', title: '数据看板', icon: 'DataLine', permissions: [PERMISSION.dashboardRead] },
  { path: '/order', title: '订单管理', icon: 'List', permissions: [PERMISSION.orderRead] },
  { path: '/dish', title: '菜品管理', icon: 'Dish', permissions: [PERMISSION.dishRead] },
  { path: '/category', title: '分类管理', icon: 'Category', permissions: [PERMISSION.categoryRead] },
  { path: '/activity', title: '活动运营位', icon: 'Activity', permissions: [PERMISSION.activityRead] },
  { path: '/promotion', title: '限时活动', icon: 'Promotion', permissions: [PERMISSION.promotionRead] },
  { path: '/member', title: '会员管理', icon: 'Member', permissions: [PERMISSION.memberRead] },
  { path: '/staff', title: '员工管理', icon: 'Staff', permissions: [PERMISSION.staffRead] },
  { path: '/payment', title: '收款设置', icon: 'Payment', permissions: [PERMISSION.paymentRead] },
  { path: '/store', title: '门店设置', icon: 'Store', permissions: [PERMISSION.storeRead] },
]
