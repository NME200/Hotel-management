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
 * 定店守卫：所有带门店上下文的 /client 接口的前置闸门。
 *
 * 门店**只**来自请求里的 merchantCode（扫码带进来、门店列表选的、或请求头给的），
 * 不再从登录令牌里推。这是「一个微信账号能在多家店下单」的前提：
 * 以前令牌里钉着 merchantId，顾客一切店令牌就和门店对不上，守卫只能拒绝，
 * 表现就是「换个店登录就掉了」。
 *
 * 越读别家数据的风险没有因此变大：所有查询仍然是「解析出来的 merchantId +
 * 当前顾客的会员档案」两个条件一起走 TenantRepo，顾客拿不到别人的档案。
 *
 * 商户停用、到期、没配门店，都在这里一次性挡掉，业务代码不必重复判断。
 */
@Injectable()
export class ClientMerchantGuard implements CanActivate {
  constructor(private readonly stores: ClientStoreService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ClientRequest>();
    const code = readMerchantCode(request);
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

/** 与守卫共用一套取值口径，供 ClientSessionGuard 判断当前门店。 */
export function readRequestMerchantCode(request: Request): string | null {
  return readMerchantCode(request as ClientRequest);
}
