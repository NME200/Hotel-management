/**
 * TanStack Query 缓存键。列表/详情共用同一个模块前缀，
 * mutation 成功后 invalidate 前缀即可让该模块全部数据重新拉取。
 */
export const QUERY_KEYS = {
  profile: ['profile'] as const,
  dashboard: ['platform', 'dashboard'] as const,
  merchants: ['platform', 'merchants'] as const,
  merchantDetail: ['platform', 'merchant-detail'] as const,
  expiring: ['platform', 'merchants', 'expiring'] as const,
  /** 商户数据只读穿透：同一商户下的统计/菜品/订单/会员/员工共用此前缀 */
  merchantInsight: ['platform', 'merchant-insight'] as const,
  accounts: ['platform', 'accounts'] as const,
  audits: ['platform', 'audits'] as const,
  /** 支付渠道级配置（三条渠道一张表，整体失效） */
  paymentChannels: ['platform', 'payment-channels'] as const,
  /** 商户进件与开通：列表与统计卡共用此前缀 */
  merchantPayment: ['platform', 'merchant-payment'] as const,
  /** 全平台支付流水：列表 / 统计卡 / 退款 / 通知记录共用此前缀 */
  platformPayments: ['platform', 'payments'] as const,
  /** 平台分账：列表 / 统计卡 / 详情共用此前缀 */
  platformProfitShares: ['platform', 'profit-shares'] as const,
  /** 交易对账：台账列表 / 统计卡 / 差异明细共用此前缀 */
  platformReconciles: ['platform', 'reconciliations'] as const,
  /** 小程序配置：全局单条配置，读取与保存后整体失效 */
  miniProgramConfig: ['platform', 'mini-program-config'] as const,
}
