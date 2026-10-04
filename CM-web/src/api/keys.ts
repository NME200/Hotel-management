/**
 * TanStack Query 缓存键。列表/详情共用同一个模块前缀，
 * mutation 成功后 invalidate 前缀即可让该模块全部数据重新拉取。
 */
export const QUERY_KEYS = {
  profile: ['profile'] as const,
  categories: ['merchant', 'categories'] as const,
  dishes: ['merchant', 'dishes'] as const,
  dishDetail: ['merchant', 'dish-detail'] as const,
  orders: ['merchant', 'orders'] as const,
  orderSummary: ['merchant', 'order-summary'] as const,
  tables: ['merchant', 'tables'] as const,
  paymentMethods: ['merchant', 'cashier', 'payment-methods'] as const,
  printTasks: ['merchant', 'print-tasks'] as const,
}
