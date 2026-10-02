import { http } from './request'
import type {
  MerchantPaymentAuditInput,
  MerchantPaymentConfigItem,
  MerchantPaymentConfigListParams,
  MerchantPaymentSummary,
  MerchantPaymentSwitchStatus,
  PaymentChannel,
  PaymentChannelItem,
  PaymentChannelTestResult,
  PaymentChannelUpdateInput,
  PlatformPaymentItem,
  PlatformPaymentListParams,
  PlatformPaymentNotifyLog,
  PlatformPaymentSummary,
  PlatformProfitShareItem,
  PlatformProfitShareListParams,
  PlatformProfitShareSummary,
  PlatformReconcileDetail,
  PlatformReconcileItem,
  PlatformReconcileListParams,
  PlatformReconcileSummary,
  PlatformRefundItem,
  PlatformRefundListParams,
  RunReconcileResult,
} from './types/payment'
import type { PageResult } from './types/common'

/** GET /platform/payment-channels 微信、支付宝、模拟三条渠道 */
export function fetchPaymentChannels(): Promise<PaymentChannelItem[]> {
  return http.get<PaymentChannelItem[]>('/platform/payment-channels')
}

/** PUT /platform/payment-channels/{channel} 保存渠道总开关与凭据 */
export function updatePaymentChannel(
  channel: PaymentChannel,
  input: PaymentChannelUpdateInput,
): Promise<PaymentChannelItem> {
  return http.put<PaymentChannelItem>(`/platform/payment-channels/${channel}`, input)
}

/** POST /platform/payment-channels/{channel}/test 渠道自检（模拟渠道恒通过） */
export function testPaymentChannel(channel: PaymentChannel): Promise<PaymentChannelTestResult> {
  return http.post<PaymentChannelTestResult>(`/platform/payment-channels/${channel}/test`)
}

/** GET /platform/merchant-payment-configs 商户进件与开通情况 */
export function fetchMerchantPaymentConfigs(
  params: MerchantPaymentConfigListParams,
): Promise<PageResult<MerchantPaymentConfigItem>> {
  return http.get<PageResult<MerchantPaymentConfigItem>>('/platform/merchant-payment-configs', { ...params })
}

/** GET /platform/merchant-payment-configs/summary 顶部统计卡 */
export function fetchMerchantPaymentSummary(): Promise<MerchantPaymentSummary> {
  return http.get<MerchantPaymentSummary>('/platform/merchant-payment-configs/summary')
}

/** GET /platform/merchant-payment-configs/merchant/{id} 某商户三条渠道的完整状态（含未申请） */
export function fetchMerchantPaymentChannelsOf(
  merchantId: number,
): Promise<MerchantPaymentConfigItem[]> {
  return http.get<MerchantPaymentConfigItem[]>(`/platform/merchant-payment-configs/merchant/${merchantId}`)
}

/** POST /platform/merchant-payment-configs/{id}/audit 审核通过 / 驳回 */
export function auditMerchantPaymentConfig(
  id: number,
  input: MerchantPaymentAuditInput,
): Promise<MerchantPaymentConfigItem> {
  return http.post<MerchantPaymentConfigItem>(`/platform/merchant-payment-configs/${id}/audit`, input)
}

/** PATCH /platform/merchant-payment-configs/{id}/status 平台随时启停某商户某渠道 */
export function updateMerchantPaymentConfigStatus(
  id: number,
  status: MerchantPaymentSwitchStatus,
): Promise<MerchantPaymentConfigItem> {
  return http.patch<MerchantPaymentConfigItem>(`/platform/merchant-payment-configs/${id}/status`, { status })
}

/** GET /platform/payments 全平台支付流水分页 */
export function fetchPlatformPayments(
  params: PlatformPaymentListParams,
): Promise<PageResult<PlatformPaymentItem>> {
  return http.get<PageResult<PlatformPaymentItem>>('/platform/payments', { ...params })
}

/** GET /platform/payments/summary 交易概况 */
export function fetchPlatformPaymentSummary(): Promise<PlatformPaymentSummary> {
  return http.get<PlatformPaymentSummary>('/platform/payments/summary')
}

/** GET /platform/payments/refunds 全平台退款流水分页 */
export function fetchPlatformRefunds(
  params: PlatformRefundListParams,
): Promise<PageResult<PlatformRefundItem>> {
  return http.get<PageResult<PlatformRefundItem>>('/platform/payments/refunds', { ...params })
}

/** GET /platform/payments/{paymentNo} 支付单详情 */
export function fetchPlatformPaymentDetail(paymentNo: string): Promise<PlatformPaymentItem> {
  return http.get<PlatformPaymentItem>(`/platform/payments/${paymentNo}`)
}

/** GET /platform/payments/{paymentNo}/notifies 该支付单的渠道通知原始记录 */
export function fetchPlatformPaymentNotifies(paymentNo: string): Promise<PlatformPaymentNotifyLog[]> {
  return http.get<PlatformPaymentNotifyLog[]>(`/platform/payments/${paymentNo}/notifies`)
}

/** GET /platform/profit-shares 全平台分账流水分页（同一支付单的平台与商户已合并为一行） */
export function fetchPlatformProfitShares(
  params: PlatformProfitShareListParams,
): Promise<PageResult<PlatformProfitShareItem>> {
  return http.get<PageResult<PlatformProfitShareItem>>('/platform/profit-shares', { ...params })
}

/** GET /platform/profit-shares/summary 分账概况 */
export function fetchPlatformProfitShareSummary(): Promise<PlatformProfitShareSummary> {
  return http.get<PlatformProfitShareSummary>('/platform/profit-shares/summary')
}

/** GET /platform/profit-shares/{shareNo} 分账单详情 */
export function fetchPlatformProfitShareDetail(shareNo: string): Promise<PlatformProfitShareItem> {
  return http.get<PlatformProfitShareItem>(`/platform/profit-shares/${shareNo}`)
}

/** GET /platform/reconciliations 对账台账分页（一行 = 商户 × 渠道 × 自然日） */
export function fetchPlatformReconciles(
  params: PlatformReconcileListParams,
): Promise<PageResult<PlatformReconcileItem>> {
  return http.get<PageResult<PlatformReconcileItem>>('/platform/reconciliations', { ...params })
}

/** GET /platform/reconciliations/summary 对账概况 */
export function fetchPlatformReconcileSummary(): Promise<PlatformReconcileSummary> {
  return http.get<PlatformReconcileSummary>('/platform/reconciliations/summary')
}

/** GET /platform/reconciliations/{reconcileNo} 台账详情（含差异明细） */
export function fetchPlatformReconcileDetail(reconcileNo: string): Promise<PlatformReconcileDetail> {
  return http.get<PlatformReconcileDetail>(`/platform/reconciliations/${reconcileNo}`)
}

/** POST /platform/reconciliations/run 手动补跑指定日期的对账（重算，不改动资金数据） */
export function runPlatformReconcile(input: {
  tradeDate: string
  channel?: PaymentChannel
}): Promise<RunReconcileResult> {
  return http.post<RunReconcileResult>('/platform/reconciliations/run', input)
}
