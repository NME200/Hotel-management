import type { PaymentChannel } from '../constants/payment.constant';
import type { ReconcileDiffType, ReconcileStatus } from '../constants/reconcile.constant';

/**
 * 平台端对账台账视图（一行 = 商户 × 渠道 × 自然日）。
 * 金额一律以「元」number 返回，与支付流水页保持一致，避免前端两套口径。
 */
export interface PlatformReconcileItem {
  id: number;
  reconcileNo: string;
  merchantId: number;
  merchantCode: string;
  merchantName: string;
  channel: PaymentChannel;
  /** 对账日 YYYY-MM-DD */
  tradeDate: string;

  /** 渠道侧：笔数 / 金额（元）/ 手续费（元） */
  channelCount: number;
  channelAmount: number;
  channelFee: number;

  /** 本地侧：笔数 / 金额（元）/ 当日退款（元，不冲抵交易额） */
  localCount: number;
  localAmount: number;
  localRefund: number;

  /** 差异笔数 / 差异金额（元，按绝对值累加） */
  diffCount: number;
  diffAmount: number;

  status: ReconcileStatus;
  billDownloaded: boolean;
  billFetchedAt: Date | null;
  retryCount: number;
  nextRetryAt: Date | null;
  reconciledAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
}

/** 单条差异明细，给运营直接看"哪一笔、差多少、怎么处理"。 */
export interface PlatformReconcileDetailItem {
  id: number;
  reconcileId: number;
  merchantId: number;
  channel: PaymentChannel;
  diffType: ReconcileDiffType;
  outTradeNo: string;
  paymentId: number | null;
  channelAmount: number | null;
  localAmount: number | null;
  diffAmount: number;
  channelTradeNo: string | null;
  localTradeNo: string | null;
  remark: string;
  channelPaidAt: Date | null;
}

/** 台账详情：台账本身 + 差异明细。 */
export interface PlatformReconcileDetail {
  reconcile: PlatformReconcileItem;
  details: PlatformReconcileDetailItem[];
}

/** 对账概况卡片。 */
export interface PlatformReconcileSummary {
  /** 最近一次对账的对账日 YYYY-MM-DD */
  lastTradeDate: string | null;
  balancedCount: number;
  mismatchCount: number;
  pendingCount: number;
  failedCount: number;
  /** 未平账的差异金额合计（元） */
  diffAmount: number;
}

/** 手动补跑结果。 */
export interface RunReconcileResult {
  tradeDate: string;
  channel: PaymentChannel | null;
  /** 本轮处理的台账数（新建或重算） */
  handled: number;
}
