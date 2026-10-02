import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { BusinessException } from '../exceptions/business.exception';
import type { AuthUser } from '../models/auth-context';

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, context: ExecutionContext): AuthUser | unknown => {
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) {
      throw BusinessException.forbidden('未登录或登录已失效');
    }
    return data === undefined ? user : user[data];
  },
);

/**
 * 当前登录态所属商户 ID。商户侧接口的租户键只能来自 token，
 * 不接受任何请求参数传入，从根源上杜绝越权查询其他商户数据。
 */
export const MerchantId = createParamDecorator(
  (_: undefined, context: ExecutionContext): number => {
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user || user.merchantId === null) {
      throw BusinessException.forbidden('该接口仅商户账号可访问');
    }
    return user.merchantId;
  },
);
