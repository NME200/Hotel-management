/** 平台侧审计动作机器码，前端筛选下拉与落库共用同一份。 */
export const AuditAction = {
  MerchantCreate: 'merchant.create',
  MerchantUpdate: 'merchant.update',
  MerchantStatus: 'merchant.status',
  AccountCreate: 'account.create',
  AccountUpdate: 'account.update',
  AccountPassword: 'account.password',
  PaymentChannelUpdate: 'payment.channel.update',
  MerchantPaymentAudit: 'payment.merchant.audit',
  MerchantPaymentStatus: 'payment.merchant.status',
  MerchantPaymentApply: 'payment.merchant.apply',
  MerchantProfitShareRate: 'payment.merchant.profit_share_rate',
  MiniProgramConfigUpdate: 'mini_program.config.update',
  PlatformLogin: 'auth.login',
  PlatformLoginFailed: 'auth.login_failed',
  PlatformLogout: 'auth.logout',
  PlatformPasswordChanged: 'auth.password_changed',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  [AuditAction.MerchantCreate]: '开通商户',
  [AuditAction.MerchantUpdate]: '修改商户资料',
  [AuditAction.MerchantStatus]: '变更商户状态',
  [AuditAction.AccountCreate]: '新增平台账号',
  [AuditAction.AccountUpdate]: '修改平台账号',
  [AuditAction.AccountPassword]: '重置平台账号密码',
  [AuditAction.PaymentChannelUpdate]: '修改支付渠道配置',
  [AuditAction.MerchantPaymentAudit]: '审核商户支付进件',
  [AuditAction.MerchantPaymentStatus]: '启停商户支付渠道',
  [AuditAction.MerchantPaymentApply]: '商户提交支付进件',
  [AuditAction.MerchantProfitShareRate]: '调整商户抽佣比例',
  [AuditAction.MiniProgramConfigUpdate]: '修改小程序配置',
  [AuditAction.PlatformLogin]: '平台登录',
  [AuditAction.PlatformLoginFailed]: '平台登录失败',
  [AuditAction.PlatformLogout]: '平台退出登录',
  [AuditAction.PlatformPasswordChanged]: '平台账号修改密码',
};

export const AuditTargetType = {
  Merchant: 'merchant',
  Account: 'account',
  Auth: 'auth',
  MiniProgram: 'mini_program',
  PaymentChannel: 'payment_channel',
  MerchantPayment: 'merchant_payment',
} as const;
export type AuditTargetType = (typeof AuditTargetType)[keyof typeof AuditTargetType];

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action as AuditAction] ?? action;
}
