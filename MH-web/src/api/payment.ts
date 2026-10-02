import { http } from './request'
import type { MerchantPaymentConfigItem, PaymentApplyInput } from './types/payment'

/** GET /merchant/payment-configs：固定返回微信 / 支付宝 / 模拟三条 */
export function fetchPaymentConfigs(): Promise<MerchantPaymentConfigItem[]> {
  return http.get<MerchantPaymentConfigItem[]>('/merchant/payment-configs')
}

/** POST /merchant/payment-configs/apply：首次申请与重新进件共用，成功后状态变为待审核 */
export function applyPaymentConfig(input: PaymentApplyInput): Promise<MerchantPaymentConfigItem> {
  return http.post<MerchantPaymentConfigItem>('/merchant/payment-configs/apply', input)
}
