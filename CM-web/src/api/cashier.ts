import { http } from './request'
import type {
  CashierMemberView,
  CashierOrderView,
  CashierPaymentMethod,
  CashierPreviewView,
  CreateCashierOrderInput,
  CreatePaymentInput,
  PaymentView,
  RefundView,
} from './types/cashier'

/** GET /merchant/cashier/payment-methods —— 线下渠道恒可用，在线渠道按开通情况给原因 */
export function fetchPaymentMethods(): Promise<CashierPaymentMethod[]> {
  return http.get<CashierPaymentMethod[]>('/merchant/cashier/payment-methods')
}

/** GET /merchant/cashier/members/lookup —— 按手机号认会员，查不到返回 null */
export function lookupMember(phone: string): Promise<CashierMemberView | null> {
  return http.get<CashierMemberView | null>('/merchant/cashier/members/lookup', { phone })
}

/** POST /merchant/cashier/orders/preview —— 下单前算价，不落库不扣库存 */
export function previewCashierOrder(payload: CreateCashierOrderInput): Promise<CashierPreviewView> {
  return http.post<CashierPreviewView>('/merchant/cashier/orders/preview', payload)
}

/** POST /merchant/cashier/orders —— 线下点餐建单，金额由后端计算 */
export function createCashierOrder(payload: CreateCashierOrderInput): Promise<CashierOrderView> {
  return http.post<CashierOrderView>('/merchant/cashier/orders', payload)
}

/**
 * POST /merchant/payments —— 结账。
 *
 * 现金与收款码也走这里：后端把它们当渠道处理，创建即成功，
 * 于是「收款记录」与在线支付共用同一张流水表、同一套状态机。
 */
export function createPayment(payload: CreatePaymentInput): Promise<PaymentView> {
  return http.post<PaymentView>('/merchant/payments', payload)
}

/** GET /merchant/payments/order/{orderId} —— 查某单最近一笔支付 */
export function fetchPaymentByOrder(orderId: number): Promise<PaymentView | null> {
  return http.get<PaymentView | null>(`/merchant/payments/order/${orderId}`)
}

/** POST /merchant/payments/order/{orderId}/refund —— 退款，不传金额即全额 */
export function refundOrder(
  orderId: number,
  payload: { amount?: number; reason?: string },
): Promise<RefundView> {
  return http.post<RefundView>(`/merchant/payments/order/${orderId}/refund`, payload)
}
