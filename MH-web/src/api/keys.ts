/**
 * TanStack Query 缓存键。列表/详情共用同一个模块前缀，
 * mutation 成功后 invalidate 前缀即可让该模块全部数据重新拉取。
 */
export const QUERY_KEYS = {
  profile: ['profile'] as const,
  dashboard: ['merchant', 'dashboard'] as const,
  store: ['merchant', 'store'] as const,
  categories: ['merchant', 'categories'] as const,
  dishes: ['merchant', 'dishes'] as const,
  activities: ['merchant', 'activities'] as const,
  promotions: ['merchant', 'promotions'] as const,
  dishDetail: ['merchant', 'dish-detail'] as const,
  orders: ['merchant', 'orders'] as const,
  orderSummary: ['merchant', 'order-summary'] as const,
  printers: ['merchant', 'printers'] as const,
  printTasks: ['merchant', 'print-tasks'] as const,
  tables: ['merchant', 'tables'] as const,
  members: ['merchant', 'members'] as const,
  staffs: ['merchant', 'staffs'] as const,
  paymentConfigs: ['merchant', 'payment-configs'] as const,
}
