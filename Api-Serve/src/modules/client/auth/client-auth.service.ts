import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import {
  Gender,
  MemberLevel,
  MemberStatus,
  UserType,
} from '../../../common/constants/dict';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { Member } from '../../../database/entities/member.entity';
import { Merchant } from '../../../database/entities/merchant.entity';
import { Store } from '../../../database/entities/store.entity';
import type { AuthResult, AuthUserProfile } from '../../auth/models/auth-result.model';
import { TokenService } from '../../auth/token.service';
import { CLIENT_ROLE } from '../constants/client.constant';
import type { ClientLoginDto, ClientRefreshDto } from '../dto/client-auth.dto';
import { ClientMemberService } from '../member/client-member.service';
import type { ClientMemberBrief } from '../models/client-member.model';
import { ClientStoreService } from '../store/client-store.service';
import type { ClientStoreView } from '../store/client-store.service';
import { WechatMiniService } from '../wechat/wechat-mini.service';

export interface ClientAuthResult extends AuthResult {
  /** 首次扫码进店会自动建档，前端据此只弹一次新手引导 */
  isNewMember: boolean;
  member: ClientMemberBrief;
  store: ClientStoreView;
}

/** 应用启动时的会话恢复结果：不换令牌，只回当前登录态看到的数据。 */
export interface ClientSessionView {
  member: ClientMemberBrief;
  store: ClientStoreView;
}

const DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

/**
 * 顾客登录：wx.login 的 code → openid → 定店 → 建档 → 发顾客令牌。
 *
 * 令牌复用后台同一套签名与 Redis 会话机制，区别只在 userType：
 * 顾客令牌带着 merchantId（租户键）与 memberId，权限集合恒为空，
 * 因此既进不了后台接口，也没有别的门店的数据可读。
 */
@Injectable()
export class ClientAuthService {
  private readonly members: TenantRepo<Member>;

  constructor(
    @InjectRepository(Member) memberRepository: Repository<Member>,
    private readonly wechat: WechatMiniService,
    private readonly stores: ClientStoreService,
    private readonly memberService: ClientMemberService,
    private readonly tokens: TokenService,
  ) {
    this.members = new TenantRepo(memberRepository);
  }

  async login(dto: ClientLoginDto): Promise<ClientAuthResult> {
    const session = await this.wechat.code2session(dto.code);
    const context = await this.stores.resolve(dto.merchantCode);

    const existing = await this.members.findBy(context.merchant.id, { openid: session.openid });
    if (existing) {
      this.assertMemberUsable(existing);
      return this.issueFor(existing, context, false);
    }

    const member = await this.openAccount(context.merchant.id, session, dto);
    this.assertMemberUsable(member);
    return this.issueFor(member, context, true);
  }

  async refresh(dto: ClientRefreshDto): Promise<ClientAuthResult> {
    const session = await this.tokens.readSession(dto.refreshToken);
    if (session.userType !== UserType.Client) {
      throw new BusinessException('该刷新令牌不属于顾客登录态', HttpStatus.UNAUTHORIZED);
    }
    const member = await this.memberService.requireMember(session.sub);
    this.assertMemberUsable(member);
    return this.issueFor(member, await this.stores.resolveById(member.merchantId), false);
  }

  /**
   * 带着 access token 换回会员与门店信息，用于小程序冷启动恢复界面。
   * 这里只回展示字段、不换令牌：换令牌会在 Redis 里多挂一个会话。
   */
  async current(merchantId: number, memberId: number): Promise<ClientSessionView> {
    const member = await this.members.findById(merchantId, memberId);
    const context = await this.stores.resolveById(merchantId);
    const counts = await this.memberService.couponCounts(merchantId, memberId);
    return {
      member: this.memberService.toBrief(member, counts),
      store: this.stores.toView(context.merchant, context.store),
    };
  }

  async logout(sessionId: string): Promise<null> {
    await this.tokens.revoke(sessionId);
    return null;
  }

  private async issueFor(
    member: Member,
    context: { merchant: Merchant; store: Store },
    isNewMember: boolean,
  ): Promise<ClientAuthResult> {
    const auth = await this.tokens.issue(this.toProfile(member, context.merchant.name));
    return {
      ...auth,
      isNewMember,
      member: await this.memberService.brief(member.merchantId, member.id),
      store: this.stores.toView(context.merchant, context.store),
    };
  }

  /**
   * 首次进入自动建档。
   *
   * 手机号此刻拿不到（微信要求单独授权），留空由顾客在个人中心或结算时补；
   * (merchant_id, openid) 唯一索引兜住并发重复扫码。
   */
  private async openAccount(
    merchantId: number,
    session: { openid: string; unionid: string | null },
    dto: ClientLoginDto,
  ): Promise<Member> {
    try {
      return await this.members.create(merchantId, {
        openid: session.openid,
        unionid: session.unionid,
        nickname: dto.nickname?.trim() || defaultNickname(session.openid),
        avatar: dto.avatar?.trim() || null,
        phone: null,
        gender: Gender.Unknown,
        level: MemberLevel.Normal,
      });
    } catch (error) {
      if (error instanceof QueryFailedError && isDuplicateEntry(error)) {
        // 两个请求同时在建档：谁先落库谁生效，后到的直接复用既有会员
        const raced = await this.members.findBy(merchantId, { openid: session.openid });
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }

  private assertMemberUsable(member: Member): void {
    if (member.status !== MemberStatus.Active) {
      throw BusinessException.forbidden('会员账号已被店家停用，请联系门店');
    }
  }

  private toProfile(member: Member, merchantName: string): AuthUserProfile {
    return {
      id: member.id,
      // 令牌里不放 openid，用会员 ID 派生一个稳定的展示名
      username: `member_${member.id}`,
      realName: member.nickname,
      userType: UserType.Client,
      merchantId: member.merchantId,
      merchantName,
      role: CLIENT_ROLE,
      permissions: [],
    };
  }
}

function defaultNickname(openid: string): string {
  return `顾客${openid.slice(-4)}`;
}

function isDuplicateEntry(error: QueryFailedError): boolean {
  const driverError = error as QueryFailedError & { code?: string; errno?: number };
  return driverError.code === DUPLICATE_ENTRY || driverError.errno === 1062;
}
