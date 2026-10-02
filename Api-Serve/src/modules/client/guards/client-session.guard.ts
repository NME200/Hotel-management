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

function readUser(context: ExecutionContext): AuthUser | undefined {
  return context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
}

/**
 * 顾客登录态守卫。
 *
 * 后台接口靠 @Permissions 拦住顾客令牌（顾客的权限集合恒为空）；反过来顾客接口
 * 也必须显式要求「这是一张 client 令牌」——否则一条商家员工令牌带着任意 memberId
 * 就能读到别人的订单。/client 下所有需要登录的控制器都挂这个守卫。
 *
 * 顺带把「显式带了 merchantCode 就必须与登录门店一致」也放在这里：
 * 顾客在 A 店页面里串到 B 店参数时，与其静默忽略这个参数（同一份语义在
 * ClientMerchantGuard 那边却是拒绝），不如统一报「请重新扫码进店」。
 * 数据本来就不会跨店（查询用的仍是令牌里的 merchantId），这条只是消灭歧义。
 */
@Injectable()
export class ClientSessionGuard implements CanActivate {
  constructor(private readonly stores: ClientStoreService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = readUser(context);
    if (!user) {
      throw BusinessException.forbidden('请先登录');
    }
    if (user.userType !== UserType.Client) {
      throw BusinessException.forbidden('该接口仅顾客登录态可访问');
    }
    if (user.merchantId === null) {
      throw BusinessException.forbidden('登录态缺少门店归属，请重新登录');
    }
    const requested = readMerchantCode(context.switchToHttp().getRequest<Request>());
    if (requested !== null) {
      const { merchant } = await this.stores.resolveById(user.merchantId);
      if (requested !== merchant.code) {
        throw BusinessException.forbidden('当前门店与登录门店不一致，请重新扫码进店');
      }
    }
    return true;
  }
}

function readMerchantCode(request: Request): string | null {
  const query = request.query as Record<string, unknown> | undefined;
  const body = request.body as { merchantCode?: unknown } | undefined;
  for (const value of [query?.merchantCode, body?.merchantCode]) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

/** 当前登录会员 ID（顾客侧接口的「我是谁」，只能来自令牌）。 */
export const ClientMemberId = createParamDecorator(
  (_: undefined, context: ExecutionContext): number => {
    const user = readUser(context);
    if (!user || user.userType !== UserType.Client) {
      throw BusinessException.forbidden('请先登录');
    }
    return user.id;
  },
);

/** 当前登录会员所属商户 ID，即顾客侧接口的租户键。 */
export const ClientMerchantId = createParamDecorator(
  (_: undefined, context: ExecutionContext): number => {
    const user = readUser(context);
    if (!user || user.userType !== UserType.Client || user.merchantId === null) {
      throw BusinessException.forbidden('请先登录');
    }
    return user.merchantId;
  },
);

/**
 * 可选的会员 ID：公开接口上用来做个性化展示（比如「这张券你已经领完了」），
 * 没登录就是 null。只读，不做任何拦截，所以不能替代 @UseGuards。
 */
export const OptionalClientMemberId = createParamDecorator(
  (_: undefined, context: ExecutionContext): number | null => {
    const user = readUser(context);
    return user !== undefined && user.userType === UserType.Client ? user.id : null;
  },
);
