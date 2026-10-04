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
  | 'Postcard'
  | 'Printer'
  | 'Message'

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

/** 渲染用的菜单行：children 为空数组即叶子项（分组容器本身不可点击） */
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

const dashboard: MenuConfigItem = {
  path: '/dashboard',
  title: '平台看板',
  icon: 'DataLine',
  permissions: [PERMISSION.dashboardRead],
}

const merchant: MenuConfigItem = {
  path: '/merchant',
  title: '商户管理',
  icon: 'Shop',
  permissions: [PERMISSION.merchantRead],
}

const expiring: MenuConfigItem = {
  path: '/expiring',
  title: '到期预警',
  icon: 'AlarmClock',
  permissions: [PERMISSION.merchantRead],
}

const member: MenuConfigItem = {
  path: '/member',
  title: '会员管理',
  icon: 'Postcard',
  permissions: [PERMISSION.platformMemberRead],
}

const payment: MenuConfigItem = {
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
}

const system: MenuConfigItem = {
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
    {
      path: '/system/print-provider',
      title: '云打印机配置',
      icon: 'Printer',
      permissions: [PERMISSION.printRead],
    },
    { path: '/system/sms', title: '短信配置', icon: 'Message', permissions: [PERMISSION.smsRead] },
  ],
}

/**
 * 主菜单按动线分组：看数 → 管商户 → 管钱 → 配系统。
 * 分组只是视觉与扫读的单位，可见性仍逐项按权限算（整组空则不渲染标题）。
 */
export const MENU_SECTIONS: readonly MenuSection[] = [
  { title: '经营', items: [dashboard] },
  { title: '商户与会员', items: [merchant, expiring, member] },
  { title: '资金', items: [payment] },
  { title: '系统', items: [system] },
]

/**
 * 低频管理项沉到侧栏底部并弱化：账号与审计不是每天的动线，
 * 留在主列表里只会把真正要点的三项挤下去。
 */
export const MENU_FOOTER_ITEMS: readonly MenuConfigItem[] = [
  { path: '/account', title: '平台账号', icon: 'UserFilled', permissions: [PERMISSION.accountManage] },
  { path: '/audit', title: '操作审计', icon: 'Tickets', permissions: [PERMISSION.auditRead] },
]
