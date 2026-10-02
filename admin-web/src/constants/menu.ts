import { PERMISSION } from './permission'

/** 侧边菜单图标名，具体组件在 layouts/components/SidebarMenu.vue 里按需注册 */
export type MenuIconName =
  | 'DataLine'
  | 'Shop'
  | 'AlarmClock'
  | 'UserFilled'
  | 'Tickets'
  | 'Money'
  | 'CreditCard'
  | 'Wallet'
  | 'Coin'
  | 'ScaleToOriginal'
  | 'DocumentChecked'
  | 'Setting'
  | 'Cellphone'

export interface MenuConfigItem {
  /** 与 router/routes.ts 中的子路由 path 对应；父级分组只作为展开容器，本身不可点击 */
  path: string
  title: string
  icon: MenuIconName
  /** 需要的权限，全部满足才显示；缺省表示登录即可见 */
  permissions?: string[]
  /** 子菜单项，配置后该项渲染为 el-sub-menu 分组 */
  children?: readonly MenuConfigItem[]
}

export const MENU_ITEMS: readonly MenuConfigItem[] = [
  { path: '/dashboard', title: '平台看板', icon: 'DataLine', permissions: [PERMISSION.dashboardRead] },
  { path: '/merchant', title: '商户管理', icon: 'Shop', permissions: [PERMISSION.merchantRead] },
  { path: '/expiring', title: '到期预警', icon: 'AlarmClock', permissions: [PERMISSION.merchantRead] },
  {
    // 分组不单独设权限：只要有一个子项可见就展示，两个子项的权限点不同
    path: '/payment',
    title: '支付管理',
    icon: 'Money',
    children: [
      { path: '/payment/channel', title: '支付渠道', icon: 'CreditCard', permissions: [PERMISSION.paymentManage] },
      { path: '/payment/merchant', title: '商户支付', icon: 'Wallet', permissions: [PERMISSION.merchantPaymentRead] },
      { path: '/payment/flow', title: '支付流水', icon: 'Coin', permissions: [PERMISSION.paymentRead] },
      {
        path: '/payment/profit-share',
        title: '平台分账',
        icon: 'ScaleToOriginal',
        permissions: [PERMISSION.paymentRead],
      },
      {
        path: '/payment/reconcile',
        title: '交易对账',
        icon: 'DocumentChecked',
        permissions: [PERMISSION.paymentRead],
      },
    ],
  },
  {
    // 系统设置：平台级的全局配置，小程序凭据是第一项；同样只按子项权限控制可见性
    path: '/system',
    title: '系统设置',
    icon: 'Setting',
    children: [
      {
        path: '/system/mini-program',
        title: '小程序配置',
        icon: 'Cellphone',
        permissions: [PERMISSION.miniProgramManage],
      },
    ],
  },
  { path: '/account', title: '平台账号', icon: 'UserFilled', permissions: [PERMISSION.accountManage] },
  { path: '/audit', title: '操作审计', icon: 'Tickets', permissions: [PERMISSION.auditRead] },
]
