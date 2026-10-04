import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { BusinessException } from '../../../common/exceptions/business.exception';
import type { Payment } from '../../../database/entities/payment.entity';
import type { PaymentRefund } from '../../../database/entities/payment-refund.entity';
import type { ProfitShare } from '../../../database/entities/profit-share.entity';
import {
  PaymentChannel,
  PaymentStatus,
  RefundStatus,
} from '../constants/payment.constant';
import type {
  BillDownloadContext,
  ChannelBill,
  ChannelProfitShareResult,
  ChannelRefundResult,
  ChannelTradeState,
  ChannelUnfreezeResult,
  CreatePaymentCommand,
  CreatedPaymentResult,
  NormalizedNotify,
  NotifyAck,
  PaymentProvider,
  ProfitShareCommand,
} from './payment-provider.interface';

/**
 * 线下收款渠道：现金与「收款码被扫」。
 *
 * 这两种收款的共同点是**钱不经过平台**：收银员当面收完，这笔单在业务上就已经结清。
 * 所以这里没有网络请求、没有验签、没有异步通知 —— `create()` 直接返回成功，
 * 后续走的是与真渠道**完全相同**的那条 `markOrderPaid` 链路
 * （置 pay_status、发取餐码、按抽佣比例生成分账单），
 * 因此收银台的收款记录和在线支付共用同一张 `payment` 表、同一套状态机，
 * 不会出现「两处都在改订单支付状态」的分叉。
 *
 * 三个刻意的不支持，改代码时不要顺手补上：
 * - **不参与对账**：没有渠道账单，硬对只会产出满屏假差异；
 * - **不支持分账**：资金没走渠道，平台无从在资金流里冻结抽佣；
 * - **没有通知**：状态在下单那一刻即终态，不存在「等回调」。
 */
abstract class OfflinePaymentProviderBase implements PaymentProvider {
  abstract readonly channel: PaymentChannel;

  /** 渠道流水号前缀，便于在支付流水里一眼区分线下收款 */
  protected abstract readonly tradePrefix: string;

  /** 线下渠道永远可用：不需要平台开开关，也不需要商户进件。 */
  isReady(): boolean {
    return true;
  }

  async create(command: CreatePaymentCommand): Promise<CreatedPaymentResult> {
    const { payment } = command;
    return {
      status: PaymentStatus.Succeeded,
      tradeNo: `${this.tradePrefix}${Date.now()}${payment.id ?? ''}`,
      prepayId: null,
      // 线下收款没有需要客户端调起的参数，空对象让前端按「已收款」渲染
      payParams: {},
      paidAt: new Date(),
    };
  }

  async query(payment: Payment): Promise<ChannelTradeState> {
    // 线下收款没有可查的远端状态：本地是 succeeded 就是 succeeded
    return {
      status:
        payment.status === PaymentStatus.Succeeded
          ? PaymentStatus.Succeeded
          : payment.status,
      tradeNo: payment.tradeNo,
      amountCents: payment.amountCents,
      paidAt: payment.paidAt,
      raw: { offline: true, channel: this.channel },
    };
  }

  /** 线下收款没有可撤销的远端单据，关单只落本地状态。 */
  async close(): Promise<void> {
    return;
  }

  /**
   * 退款：现金退回抽屉、收款码原路退回都是**线下动作**，
   * 收银员点退款即视为已经退给顾客，所以直接置成功。
   */
  async refund(refund: PaymentRefund, payment: Payment): Promise<ChannelRefundResult> {
    return {
      status: RefundStatus.Succeeded,
      channelRefundId: `${this.tradePrefix}RF${Date.now()}`,
      amountCents: refund.amountCents,
      raw: { offline: true, paymentNo: payment.paymentNo, instant: true },
    };
  }

  async profitShare(_command: ProfitShareCommand): Promise<ChannelProfitShareResult> {
    throw BusinessException.badRequest('线下收款不经过渠道，无法下发分账指令');
  }

  async unfreezeShare(_share: ProfitShare): Promise<ChannelUnfreezeResult> {
    throw BusinessException.badRequest('线下收款没有可解冻的分账资金');
  }

  async downloadBill(_billDate: string, _context?: BillDownloadContext): Promise<ChannelBill> {
    throw BusinessException.badRequest('线下收款渠道没有渠道账单，不参与对账');
  }

  async parseNotify(_request: Request): Promise<NormalizedNotify> {
    throw BusinessException.badRequest('线下收款渠道没有异步通知');
  }

  buildAck(error?: string): NotifyAck {
    return error
      ? { httpStatus: 200, body: { code: 'FAIL', message: error } }
      : { httpStatus: 200, body: { code: 'SUCCESS' } };
  }
}

/** 现金收款 */
@Injectable()
export class CashPaymentProvider extends OfflinePaymentProviderBase {
  readonly channel = PaymentChannel.Cash;
  protected readonly tradePrefix = 'CASH';
}

/** 收款码被扫（商户出示收款码，顾客扫码支付后收银员确认到账） */
@Injectable()
export class OfflineScanPaymentProvider extends OfflinePaymentProviderBase {
  readonly channel = PaymentChannel.Offline;
  protected readonly tradePrefix = 'OFF';
}
