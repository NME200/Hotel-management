import {
  CanActivate,
  ExecutionContext,
  Injectable,
  createParamDecorator,
} from '@nestjs/common';
import { UserType } from '../../../common/constants/dict';
import { BusinessException } from '../../../common/exceptions/business.exception';
import type { AuthUser } from '../../../common/models/auth-context';
import type { Request } from 'express';
import { ClientStoreService } from '../store/client-store.service';

/** 守卫解析出门店归属后挂在 request 上，控制器只通过 @ClientMerchant() 读取。 */
export const CLIENT_MERCHANT_KEY = 'clientMerchantId';

type ClientRequest = Request & {
  user?: AuthUser;
  [CLIENT_MERCHANT_KEY]?: number;
};

/**
 * 定店守卫：所有 /client 业务接口的前置闸门。
 *
 * 顾客侧的租户键有两个来源——登录令牌里的 merchantId，和扫码带进来的 merchantCode。
 * 规则很简单：
 * - 已登录：一律以令牌为准，请求再带 merchantCode 时必须一致，
 *   否则说明顾客在两家店之间串了页面，让他重新进店而不是默默读到别家数据；
 * - 未登录（浏览菜单、看门店）：必须显式给 merchantCode，取自
 *   query.merchantCode → body.merchantCode → X-Merchant-Code 请求头；
 * - 商户停用、到期、没配门店，都在这里一次性挡掉，业务代码不必重复判断。
 */
@Injectable()
export class ClientMerchantGuard implements CanActivate {
  constructor(private readonly stores: ClientStoreService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ClientRequest>();
    const code = readMerchantCode(request);
    const user = request.user;

    if (user?.userType === UserType.Client && user.merchantId !== null) {
      const mine = await this.stores.resolveById(user.merchantId);
      if (code && code !== mine.merchant.code) {
        throw BusinessException.forbidden('当前门店与登录门店不一致，请重新扫码进店');
      }
      request[CLIENT_MERCHANT_KEY] = user.merchantId;
      return true;
    }

    if (!code) {
      throw BusinessException.badRequest('缺少门店参数，请重新扫码或从门店列表进入');
    }
    const { merchant } = await this.stores.resolve(code);
    request[CLIENT_MERCHANT_KEY] = merchant.id;
    return true;
  }
}

/** 当前请求归属的商户 ID（顾客侧的租户键）。 */
export const ClientMerchant = createParamDecorator(
  (_: undefined, context: ExecutionContext): number => {
    const request = context.switchToHttp().getRequest<ClientRequest>();
    const merchantId = request[CLIENT_MERCHANT_KEY];
    if (!merchantId) {
      throw BusinessException.badRequest('缺少门店参数，请重新扫码进入');
    }
    return merchantId;
  },
);

function readMerchantCode(request: ClientRequest): string | null {
  const fromQuery = request.query?.merchantCode;
  const fromBody = request.body?.merchantCode;
  const fromHeader = request.headers?.['x-merchant-code'];
  for (const value of [fromQuery, fromBody, fromHeader]) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}
