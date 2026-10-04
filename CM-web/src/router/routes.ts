import type { RouteRecordRaw } from 'vue-router'

import { PERMISSION } from '@/constants/permission'
import { ROUTE_PATHS } from './meta'

export const routes: RouteRecordRaw[] = [
  {
    path: ROUTE_PATHS.login,
    name: 'login',
    component: () => import('@/views/login/LoginView.vue'),
    meta: { title: '收银台登录', requiresAuth: false },
  },
  {
    path: '/',
    component: () => import('@/layouts/CashierLayout.vue'),
    redirect: ROUTE_PATHS.home,
    children: [
      {
        path: 'cashier',
        name: 'cashier',
        component: () => import('@/views/cashier/CashierView.vue'),
        meta: { title: '点单收银', permissions: [PERMISSION.orderCreate] },
      },
      {
        path: 'tables',
        name: 'tables',
        component: () => import('@/views/table/TableBoardView.vue'),
        meta: { title: '桌位看板', permissions: [PERMISSION.tableRead] },
      },
      {
        path: 'orders',
        name: 'orders',
        component: () => import('@/views/order/CashierOrderView.vue'),
        meta: { title: '今日订单', permissions: [PERMISSION.orderRead] },
      },
      {
        path: '403',
        name: 'forbidden',
        component: () => import('@/views/error/ForbiddenView.vue'),
        meta: { title: '无访问权限' },
      },
      {
        path: ':pathMatch(.*)*',
        name: 'not-found',
        component: () => import('@/views/error/NotFoundView.vue'),
        meta: { title: '页面不存在' },
      },
    ],
  },
]
