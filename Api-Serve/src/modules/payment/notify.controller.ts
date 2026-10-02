import { Controller, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PaymentChannel } from './constants/payment.constant';
import { PaymentService } from './payment.service';

const SUPPORTED_CHANNELS = new Set<string>(Object.values(PaymentChannel));

/**
 * 渠道异步通知入口。
 *
 * 全部 @Public：可达性由渠道保证，安全性由 provider 的验签/解密保证；
 * 处理结果一律按渠道要求的格式与状态码应答，失败时返回非成功让渠道重试。
 */
@ApiTags('支付回调')
@Controller('notify')
export class NotifyController {
  constructor(private readonly paymentService: PaymentService) {}

  @Public()
  @Post(':channel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '支付/退款异步通知（wechat | alipay | mock）' })
  async handle(
    @Param('channel') channel: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    if (!SUPPORTED_CHANNELS.has(channel)) {
      response.status(HttpStatus.NOT_FOUND).json({ code: 'FAIL', message: 'unknown channel' });
      return;
    }

    const ack = await this.paymentService.handleNotify(channel as PaymentChannel, request);
    response.status(ack.httpStatus).json(ack.body);
  }
}
