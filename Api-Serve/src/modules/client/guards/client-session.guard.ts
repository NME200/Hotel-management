import {
  CanActivate,
  ExecutionContext,
  Injectable,
  createParamDecorator,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MemberStatus, UserType } from '../../../common/constants/dict';
import { BusinessException } from '../../../common/exceptions/business.exception';
import type { AuthUser } from '../../../common/models/auth-context';
import { Customer } from '../../../database/entities/customer.entity';
import type { Request } from 'express';
import {
  CLIENT_MERCHANT_KEY,
  readRequestMerchantCode,
} from './client-merchant.guard';
import { ClientMemberResolver } from '../auth/client-member.resolver';
import { ClientStoreService } from '../store/client-store.service';

/** 守卫解析出的会员档案 ID，挂在 request 上供装饰器读取。 */
export const CLIENT_MEMBER_KEY = 'clientMemberId';

type ClientRequest = Request & {
  user?: AuthUser;
  [CLIENT_MERCHANT_KEY]?: number;
  [CLIENT_MEMBER_KEY]?: number;
};

/**
 * 顾客登录态守卫，同时把「在哪家店、是哪条会员档案」一次解析好。
 *
 * 后台接口靠 @Permissions 拦住顾客令牌（顾客的权限集合恒为空）；反过来顾客接口
 * 必须显式要求「这是一张 client 令牌」——否则一条商家员工令牌带着任意 ID
 * 就能读到别人的订单。
 *
 * 关键改动：**不再**校验令牌里的门店与请求门店是否一致。令牌只代表「这个微信账号是谁」，
 * 门店由请求参数决定，两者互相独立，顾客才能在多家店之间来回切换而不掉登录。
 * 越读风险没有变大：查询条件始终是「解析出的 merchantId + 属于当前顾客的会员档案」，
 * 别人的档案拿不到，别家的数据也查不出来。
 */
@Injectable()
export class ClientSessionGuard implements CanActivate {
  constructor(
    private readonly stores: ClientStoreService,
    private readonly profiles: ClientMemberResolver,
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ClientRequest>();
    const user = request.user;
    if (!user) {
      throw BusinessException.forbidden('请先登录');
    }
    if (user.userType !== UserType.Client) {
      throw BusinessException.forbidden('该接口仅顾客登录态可访问');
    }

    const code = readRequestMerchantCode(request);
    if (!code) {
      throw BusinessException.badRequest('缺少门店参数，请重新扫码或从门店列表进入');
    }
    const { merchant } = await this.stores.resolve(code);
    request[CLIENT_MERCHANT_KEY] = merchant.id;

    // 平台级停用与门店级停用是两回事：前者整个微信账号都不能用，后者只挡这一家店。
    // 这里都要查，否则平台点了「停用」也要等令牌自然过期才生效。
    const customer = await this.customers.findOne({ where: { id: user.id } });
    if (!customer || customer.status !== MemberStatus.Active) {
      throw BusinessException.forbidden('账号已被停用，请联系平台客服');
    }

    // 走到这里的接口都是「顾客以会员身份在本店做一件事」，档案该存在了
    const member = await this.profiles.resolveOrCreate(merchant.id, user.id);
    if (member.status !== MemberStatus.Active) {
      throw BusinessException.forbidden('会员账号已被店家停用，请联系门店');
    }
    request[CLIENT_MEMBER_KEY] = member.id;
    return true;
  }
}

/**
 * 公开接口的可选登录态：带了有效的顾客令牌就顺手解析出本店档案（只查不建），
 * 没带令牌、令牌失效、或没给门店参数都按匿名放行——解析失败绝不能让公开接口变得不可用。
 *
 * 领券中心用它：同一份列表要能告诉已登录顾客「这张券你领过了」，
 * 而匿名浏览必须照常可访问。
 */
@Injectable()
export class ClientOptionalSessionGuard implements CanActivate {
  constructor(
    private readonly stores: ClientStoreService,
    private readonly profiles: ClientMemberResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ClientRequest>();
    const user = request.user;
    const code = readRequestMerchantCode(request);
    if (!user || user.userType !== UserType.Client || !code) {
      return true;
    }
    try {
      const { merchant } = await this.stores.resolve(code);
      request[CLIENT_MERCHANT_KEY] = merchant.id;
      const member = await this.profiles.find(merchant.id, user.id);
      if (member) {
        request[CLIENT_MEMBER_KEY] = member.id;
      }
    } catch {
      // 门店被停用、参数缺失等一律退回匿名语义，公开接口仍然可用
    }
    return true;
  }
}

/**
 * 当前登录的顾客 ID（跨门店稳定的那个身份）。
 *
 * 不是会员 ID：一个顾客在每家店各有一条会员档案，要档案用 @ClientMemberId()。
 */
export const ClientCustomerId = createParamDecorator(
  (_: undefined, context: ExecutionContext): number => {
    const user = readUser(context);
    if (!user || user.userType !== UserType.Client) {
      throw BusinessException.forbidden('请先登录');
    }
    return user.id;
  },
);

/** 当前门店的会员档案 ID，由 ClientSessionGuard 解析并建档后挂在 request 上。 */
export const ClientMemberId = createParamDecorator(
  (_: undefined, context: ExecutionContext): number => {
    const memberId = context.switchToHttp().getRequest<ClientRequest>()[CLIENT_MEMBER_KEY];
    if (!memberId) {
      throw BusinessException.forbidden('请先登录');
    }
    return memberId;
  },
);

/** 当前请求归属的商户 ID（顾客侧的租户键），由守卫从 merchantCode 解析。 */
export const ClientMerchantId = createParamDecorator(
  (_: undefined, context: ExecutionContext): number => {
    const merchantId = context.switchToHttp().getRequest<ClientRequest>()[CLIENT_MERCHANT_KEY];
    if (!merchantId) {
      throw BusinessException.forbidden('缺少门店上下文，请重新进店');
    }
    return merchantId;
  },
);

/**
 * 可选的会员档案：公开接口上做个性化展示（比如「这张券你已经领完了」）。
 * 没登录、或登录了但还没在这家店开过档案，都返回 null 且**不会**建档。
 */
export const OptionalClientMemberId = createParamDecorator(
  (_: undefined, context: ExecutionContext): number | null => {
    const request = context.switchToHttp().getRequest<ClientRequest>();
    const memberId = request[CLIENT_MEMBER_KEY];
    if (!memberId) {
      return null;
    }
    const user = request.user;
    return user?.userType === UserType.Client ? memberId : null;
  },
);

function readUser(context: ExecutionContext): AuthUser | undefined {
  return context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
}
