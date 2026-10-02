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
        meta: { title: '平台看板', permissions: [PERMISSION.dashboardRead] },
      },
      {
        path: 'merchant',
        name: 'merchant',
        component: () => import('@/views/merchant/MerchantView.vue'),
        meta: { title: '商户管理', permissions: [PERMISSION.merchantRead] },
      },
      {
        path: 'expiring',
        name: 'expiring',
        component: () => import('@/views/expiring/ExpiringView.vue'),
        meta: { title: '到期预警', permissions: [PERMISSION.merchantRead] },
      },
      {
        path: 'payment/channel',
        name: 'payment-channel',
        component: () => import('@/views/payment/PaymentChannelView.vue'),
        meta: { title: '支付渠道', permissions: [PERMISSION.paymentManage] },
      },
      {
        path: 'payment/merchant',
        name: 'merchant-payment',
        component: () => import('@/views/payment/MerchantPaymentView.vue'),
        meta: { title: '商户支付', permissions: [PERMISSION.merchantPaymentRead] },
      },
      {
        path: 'payment/flow',
        name: 'payment-flow',
        component: () => import('@/views/payment/PaymentFlowView.vue'),
        meta: { title: '支付流水', permissions: [PERMISSION.paymentRead] },
      },
      {
        path: 'payment/profit-share',
        name: 'payment-profit-share',
        component: () => import('@/views/payment/ProfitShareView.vue'),
        meta: { title: '平台分账', permissions: [PERMISSION.paymentRead] },
      },
      {
        path: 'payment/reconcile',
        name: 'payment-reconcile',
        component: () => import('@/views/payment/ReconcileView.vue'),
        meta: { title: '交易对账', permissions: [PERMISSION.paymentRead] },
      },
      {
        path: 'system/mini-program',
        name: 'mini-program-config',
        component: () => import('@/views/system/MiniProgramConfigView.vue'),
        meta: { title: '小程序配置', permissions: [PERMISSION.miniProgramManage] },
      },
      {
        path: 'account',
        name: 'account',
        component: () => import('@/views/account/AccountView.vue'),
        meta: { title: '平台账号', permissions: [PERMISSION.accountManage] },
      },
      {
        path: 'audit',
        name: 'audit',
        component: () => import('@/views/audit/AuditView.vue'),
        meta: { title: '操作审计', permissions: [PERMISSION.auditRead] },
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
