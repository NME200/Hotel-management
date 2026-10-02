import type { PaymentChannel } from '../constants/payment.constant';
import type { ProfitShareStatus } from '../constants/profit-share.constant';

/**
 * 平台端分账单（按支付单聚合后的一行）。
 * 平台抽佣 + 商户结算 = 支付额，两个金额都以「元」字符串返回。
 */
export interface PlatformProfitShareItem {
  /** 平台侧分账单号（该支付单的锚点） */
  shareNo: string;
  paymentId: number;
  paymentNo: string | null;
  merchantId: number;
  merchantCode: string;
  merchantName: string;
  orderId: number;
  channel: PaymentChannel;
  /** 支付额（元） */
  totalAmount: number;
  /** 平台抽佣（元） */
  platformAmount: number;
  /** 商户结算（元） */
  merchantAmount: number;
  /** 抽佣比例，如 0.06 */
  rate: number | null;
  /** 合并后的业务状态（以平台侧为准） */
  status: ProfitShareStatus;
  /** 平台侧记录状态 */
  platformStatus: ProfitShareStatus;
  /** 商户侧记录状态 */
  merchantStatus: ProfitShareStatus;
  unfreezeAt: Date;
  unfrozenAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
}

/** 分账概况卡片数据。 */
export interface PlatformProfitShareSummary {
  /** 累计平台抽佣（元） */
  totalCommission: number;
  /** 今日平台抽佣（元） */
  todayCommission: number;
  /** 待解冻笔数（pending + frozen + unfreezing） */
  pendingCount: number;
  /** 状态为 frozen 的笔数 */
  frozenCount: number;
  /** 已解冻笔数 */
  unfrozenCount: number;
  /** 解冻失败笔数 */
  failedCount: number;
}
