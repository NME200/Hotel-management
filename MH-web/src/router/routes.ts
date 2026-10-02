import type { RouteRecordRaw } from 'vue-router'

import { PERMISSION } from '@/constants/permission'
import { ROUTE_PATHS } from './meta'

export const routes: RouteRecordRaw[] = [
  {
    path: ROUTE_PATHS.login,
    name: 'login',
    component: () => import('@/views/login/LoginView.vue'),
    meta: { title: '登录', requiresAuth: false },
  },
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    redirect: ROUTE_PATHS.home,
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/dashboard/DashboardView.vue'),
        meta: { title: '数据看板', permissions: [PERMISSION.dashboardRead] },
      },
      {
        path: 'order',
        name: 'order',
        component: () => import('@/views/order/OrderView.vue'),
        meta: { title: '订单管理', permissions: [PERMISSION.orderRead] },
      },
      {
        path: 'dish',
        name: 'dish',
        component: () => import('@/views/dish/DishView.vue'),
        meta: { title: '菜品管理', permissions: [PERMISSION.dishRead] },
      },
      {
        path: 'category',
        name: 'category',
        component: () => import('@/views/category/CategoryView.vue'),
        meta: { title: '分类管理', permissions: [PERMISSION.categoryRead] },
      },
      {
        path: 'activity',
        name: 'activity',
        component: () => import('@/views/activity/ActivityView.vue'),
        meta: { title: '活动运营位', permissions: [PERMISSION.activityRead] },
      },
      {
        path: 'promotion',
        name: 'promotion',
        component: () => import('@/views/promotion/PromotionView.vue'),
        meta: { title: '限时活动', permissions: [PERMISSION.promotionRead] },
      },
      {
        path: 'member',
        name: 'member',
        component: () => import('@/views/member/MemberView.vue'),
        meta: { title: '会员管理', permissions: [PERMISSION.memberRead] },
      },
      {
        path: 'staff',
        name: 'staff',
        component: () => import('@/views/staff/StaffView.vue'),
        meta: { title: '员工管理', permissions: [PERMISSION.staffRead] },
      },
      {
        path: 'payment',
        name: 'payment',
        component: () => import('@/views/payment/PaymentSettingView.vue'),
        meta: { title: '收款设置', permissions: [PERMISSION.paymentRead] },
      },
      {
        path: 'store',
        name: 'store',
        component: () => import('@/views/store/StoreSettingView.vue'),
        meta: { title: '门店设置', permissions: [PERMISSION.storeRead] },
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
