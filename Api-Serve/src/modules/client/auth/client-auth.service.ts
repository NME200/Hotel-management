import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { Gender, MemberStatus, UserType } from '../../../common/constants/dict';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import type { AuthResult, AuthUserProfile } from '../../auth/models/auth-result.model';
import { Customer } from '../../../database/entities/customer.entity';
import { Member } from '../../../database/entities/member.entity';
import { MemberGrowthService } from '../../member-growth/member-growth.service';
import { SmsService } from '../../sms/sms.service';
import { TokenService } from '../../auth/token.service';
import { CLIENT_ROLE } from '../constants/client.constant';
import type { ClientMemberBrief } from '../models/client-member.model';
import { ClientMemberService } from '../member/client-member.service';
import { ClientMemberResolver } from './client-member.resolver';
import { ClientStoreService, type ClientStoreView } from '../store/client-store.service';
import { WechatMiniService } from '../wechat/wechat-mini.service';
import type { ClientBindPhoneDto, ClientLoginDto, ClientRefreshDto, SmsLoginDto } from '../dto/client-auth.dto';
import type { Merchant } from '../../../database/entities/merchant.entity';
import type { Store } from '../../../database/entities/store.entity';

/** 一次登录/绑定的返回：令牌之外还带上「这家店里的我」和门店上下文。 */
export interface ClientAuthResult extends AuthResult {
  /** 首次进入这家店会自动开一份会员档案，前端据此只弹一次新手引导 */
  isNewMember: boolean;
  member: ClientMemberBrief;
  store: ClientStoreView;
  /**
   * 带手机号授权时回一句结果说明：没绑成的原因（号被别的微信号占着、
   * 同店已有两份档案等）要说得清，但**不会因此让登录失败**。
   */
  phoneNote: string | null;
}

/** 应用启动时的会话恢复结果：不换令牌，只回当前登录态看到的数据。 */
export interface ClientSessionView {
  member: ClientMemberBrief;
  store: ClientStoreView;
}

const DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

/**
 * 顾客登录：wx.login 的 code → openid → 找到（或开出）跨门店的顾客身份 → 本店会员档案 → 发令牌。
 *
 * 令牌里**不再放门店**：sub 是 customer.id，merchantId 为 null。
 * 这是「切店不掉登录」的关键——以前令牌钉着 merchantId 和那家店的 memberId，
 * 顾客换店后每个请求都被守卫判成门店不一致，登录态当场作废。
 *
 * 权限集合恒为空，所以顾客令牌仍然进不了任何后台接口。
 */
@Injectable()
export class ClientAuthService {
  private readonly logger = new Logger(ClientAuthService.name);
  private readonly members: TenantRepo<Member>;

  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Member) memberRepository: Repository<Member>,
    private readonly wechat: WechatMiniService,
    private readonly stores: ClientStoreService,
    private readonly profiles: ClientMemberResolver,
    private readonly memberService: ClientMemberService,
    private readonly growth: MemberGrowthService,
    private readonly sms: SmsService,
    private readonly tokens: TokenService,
    private readonly dataSource: DataSource,
  ) {
    this.members = new TenantRepo(memberRepository);
  }

  async login(dto: ClientLoginDto): Promise<ClientAuthResult> {
    const session = await this.wechat.code2session(dto.code);
    const context = await this.stores.resolve(dto.merchantCode);

    // 换号失败不该挡住登录：顾客仍然能正常点单，只是这次没绑上手机号。
    // code 是一次性的，失败也不能替顾客重试同一个码，所以把原因原样带回给前端提示。
    let phone: string | null = null;
    let phoneNote: string | null = null;
    if (dto.phoneCode) {
      try {
        phone = (await this.wechat.getPhoneNumber(dto.phoneCode)).phone;
      } catch (error) {
        phoneNote = error instanceof Error ? error.message : '获取手机号失败';
        this.logger.warn(`顾客登录时获取手机号失败 openid=${session.openid}：${phoneNote}`);
      }
    }

    const identity = await this.resolveIdentity(session.openid, session.unionid, phone, dto);
    const customer = identity.customer;
    phoneNote = phoneNote ?? identity.note;
    this.assertCustomerUsable(customer);

    const isNewMember = (await this.profiles.find(context.merchant.id, customer.id)) === null;
    const member = await this.profiles.resolveOrCreate(context.merchant.id, customer.id);
    this.assertProfileUsable(member);
    if (identity.phoneJustBound) {
      await this.growth.creditProfileCompleted(context.merchant.id, member.id, null, phone);
    }

    return this.issueFor(customer, member, context, { isNewMember, phoneNote });
  }

  /**
   * 已登录顾客单独绑定手机号（「我的」页与会员中心的「绑定手机号」那一行）。
   *
   * 返回的是完整登录结果而不是布尔：认领历史档案时顾客身份（customer.id）会变，
   * 而令牌里放的就是 customer.id —— 不换发的话旧令牌会指向一条已删除的身份。
   */
  async bindPhone(
    customerId: number,
    merchantId: number,
    dto: ClientBindPhoneDto,
  ): Promise<ClientAuthResult> {
    const current = await this.requireCustomer(customerId);
    this.assertCustomerUsable(current);
    if (!current.openid) {
      throw BusinessException.badRequest('当前登录态没有微信身份，无法通过微信绑定手机号');
    }

    const phone = (await this.wechat.getPhoneNumber(dto.code)).phone;
    const context = await this.stores.resolveById(merchantId);
    const identity = await this.resolveIdentity(current.openid, current.unionid, phone, {});
    const customer = identity.customer;
    const member = await this.profiles.resolveOrCreate(context.merchant.id, customer.id);
    this.assertProfileUsable(member);
    if (identity.phoneJustBound) {
      await this.growth.creditProfileCompleted(context.merchant.id, member.id, null, phone);
    }

    return this.issueFor(customer, member, context, {
      isNewMember: false,
      phoneNote: identity.note,
    });
  }

  /**
   * 手机号验证码登录：没注册过的号码就地建档，注册过的直接登进去。
   *
   * 与微信一键授权共用 `resolveIdentity`，所以「商家导入的老会员第一次登录」
   * 只需要在一个地方讲清楚：号码优先，命中没有微信身份的历史档案就认领。
   *
   * 验证码通过即作废（`SmsService.verifyCode` 里删的），所以这一步之后
   * 同一个码再提交一次就是「已过期或未获取」，不存在重放。
   */
  async loginBySms(dto: SmsLoginDto): Promise<ClientAuthResult> {
    await this.sms.verifyCode(dto.phone, dto.code);

    const context = await this.stores.resolve(dto.merchantCode);
    // 带了 wxCode 却换不到 openid 就整笔失败：静默降级会留下一条「只有手机号」的身份，
    // 日后它和真正的微信身份撞在一起时又要合并一次。
    const session = dto.wxCode
      ? await this.wechat.code2session(dto.wxCode)
      : { openid: null, unionid: null };

    const identity = await this.resolveIdentity(session.openid, session.unionid, dto.phone, {
      nickname: dto.nickname,
      avatar: dto.avatar,
    });
    const customer = identity.customer;
    this.assertCustomerUsable(customer);

    const isNewMember = (await this.profiles.find(context.merchant.id, customer.id)) === null;
    const member = await this.profiles.resolveOrCreate(context.merchant.id, customer.id);
    this.assertProfileUsable(member);
    if (identity.phoneJustBound) {
      await this.growth.creditProfileCompleted(context.merchant.id, member.id, null, dto.phone);
    }

    return this.issueFor(customer, member, context, {
      isNewMember,
      phoneNote: identity.note,
    });
  }

  async refresh(dto: ClientRefreshDto): Promise<ClientAuthResult> {
    const session = await this.tokens.readSession(dto.refreshToken);
    if (session.userType !== UserType.Client) {
      throw new BusinessException('该刷新令牌不属于顾客登录态', 401);
    }
    const customer = await this.requireCustomer(session.sub);
    this.assertCustomerUsable(customer);

    const context = await this.stores.resolve(dto.merchantCode);
    const member = await this.profiles.resolveOrCreate(context.merchant.id, customer.id);
    this.assertProfileUsable(member);

    return this.issueFor(customer, member, context, { phoneNote: null }, session.sessionId);
  }

  /**
   * 带着 access token 换回「我是谁 + 我在哪家店」，用于小程序冷启动恢复界面。
   * 这里只回展示字段、不换令牌：换令牌会在 Redis 里多挂一个会话。
   */
  async current(merchantId: number, memberId: number): Promise<ClientSessionView> {
    const member = await this.members.findById(merchantId, memberId);
    const context = await this.stores.resolveById(merchantId);
    const counts = await this.memberService.couponCounts(merchantId, memberId);
    const customer = await this.requireCustomer(member.customerId);
    return {
      member: this.memberService.toBrief(member, customer, counts),
      store: this.stores.toView(context.merchant, context.store),
    };
  }

  async logout(sessionId: string): Promise<null> {
    await this.tokens.revoke(sessionId);
    return null;
  }

  /**
   * 把「微信身份 + 刚授权到的手机号」落到一条 customer 上。
   *
   * 顺序是**手机号优先**，不是 openid 优先：商家导入的历史会员有号码但没有 openid，
   * 如果先按 openid 建一个新账号，就留下两份档案（一份有微信没资产、一份有资产没微信），
   * 之后再合并都要动 member 归属。先按号码认领，首登的绝大多数情况根本不会产生第二份。
   *
   * 只认领「没有微信身份的历史档案」。号码已被另一个微信号占着时一律不合并 ——
   * 手机号会被运营商回收复用，把陌生人的会员资产接走，比让顾客找门店合并严重得多。
   */
  private async resolveIdentity(
    openid: string | null,
    unionid: string | null,
    phone: string | null,
    profile: { nickname?: string; avatar?: string },
  ): Promise<{ customer: Customer; phoneJustBound: boolean; note: string | null }> {
    const byOpenid = openid ? await this.customers.findOne({ where: { openid } }) : null;
    const byPhone = phone ? await this.customers.findOne({ where: { phone } }) : null;

    if (byPhone && !byPhone.openid) {
      if (!byOpenid) {
        return {
          customer: openid
            ? await this.attachWechat(byPhone, openid, unionid)
            : byPhone,
          phoneJustBound: false,
          note: null,
        };
      }
      if (await this.transferIdentity(byOpenid, byPhone)) {
        return {
          customer: await this.attachWechat(byPhone, openid!, unionid),
          phoneJustBound: false,
          note: null,
        };
      }
      return {
        customer: byOpenid,
        phoneJustBound: false,
        note: '这个手机号在门店已有会员档案，两家店的档案需要人工合并，请联系门店前台',
      };
    }

    if (byPhone && byPhone.openid && byPhone.openid !== openid) {
      // 没有微信身份可挂（纯手机号验证码登录）时，号码本身就是凭据，直接登进那条档案；
      // 只有「另一个微信号也想用这个号」时才不接管，避免把两个人的资产并到一起。
      if (!openid) {
        return { customer: byPhone, phoneJustBound: false, note: null };
      }
      return {
        customer: byOpenid ?? (await this.createCustomer(openid, unionid, null, profile)),
        phoneJustBound: false,
        note: '该手机号已绑定其它微信号，如需更换请联系门店',
      };
    }

    if (byOpenid) {
      if (!phone) {
        return { customer: await this.backfillUnionid(byOpenid, unionid), phoneJustBound: false, note: null };
      }
      if (byOpenid.phone && byOpenid.phone !== phone) {
        return {
          customer: byOpenid,
          phoneJustBound: false,
          note: '手机号已绑定，如需更换请联系门店',
        };
      }
      if (!byOpenid.phone) {
        await this.customers.update(byOpenid.id, { phone });
        byOpenid.phone = phone;
        return { customer: byOpenid, phoneJustBound: true, note: null };
      }
      // 号本来就是自己身上：微信侧对同一次授权可能重复回调，这里按成功处理
      return { customer: byOpenid, phoneJustBound: false, note: null };
    }

    if (!openid) {
      // 纯手机号登录（没带 wxCode）：号码本身已由短信验证过，没档案就地建一条。
      // 这条身份没有 openid，日后同一微信号用一键授权登录时会走到「认领」分支上合并。
      if (!byPhone) {
        return {
          customer: await this.createCustomer(null, null, phone, profile),
          phoneJustBound: true,
          note: null,
        };
      }
      return { customer: byPhone, phoneJustBound: false, note: null };
    }

    return {
      customer: await this.createCustomer(openid, unionid, phone, profile),
      phoneJustBound: phone !== null,
      note: null,
    };
  }

  /** 给一条历史档案补上微信身份（认领），返回刷新后的记录。 */
  private async attachWechat(
    customer: Customer,
    openid: string,
    unionid: string | null,
  ): Promise<Customer> {
    await this.customers.update(customer.id, {
      openid,
      ...(unionid && !customer.unionid ? { unionid } : {}),
    });
    const reloaded = await this.customers.findOne({ where: { id: customer.id } });
    return reloaded ?? customer;
  }

  private async backfillUnionid(customer: Customer, unionid: string | null): Promise<Customer> {
    if (unionid && !customer.unionid) {
      await this.customers.update(customer.id, { unionid });
      customer.unionid = unionid;
    }
    return customer;
  }

  /** openid 唯一索引兜住并发重复扫码：撞了就回读那条（没有 openid 时不存在这种冲突）。 */
  private async createCustomer(
    openid: string | null,
    unionid: string | null,
    phone: string | null,
    profile: { nickname?: string; avatar?: string },
  ): Promise<Customer> {
    try {
      return await this.customers.save(this.customers.create({
        openid,
        unionid,
        nickname: profile.nickname?.trim() || defaultNickname(openid, phone),
        avatar: profile.avatar?.trim() || null,
        phone,
        gender: Gender.Unknown,
        status: MemberStatus.Active,
      }));
    } catch (error) {
      if (openid && error instanceof QueryFailedError && isDuplicateEntry(error)) {
        const raced = await this.customers.findOne({ where: { openid } });
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }

  /**
   * 把旧身份名下的会员档案整体搬到目标身份上，再删掉空壳旧身份。
   *
   * 订单与券都挂在 member.id 上，所以搬 member 的行就等于搬全部历史，不用逐张表跟。
   * `(merchant_id, customer_id)` 上有唯一索引：两个身份在同一家店都有档案时搬过去会撞，
   * 而那意味着要把两份等级/余额/券相加 —— 那是经营决策，交给人做，不写在代码里。
   */
  private async transferIdentity(from: Customer, to: Customer): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const members = manager.getRepository(Member);
      const mine = await members.find({ where: { customerId: from.id }, select: { merchantId: true } });
      const theirs = await members.find({ where: { customerId: to.id }, select: { merchantId: true } });
      const takenStores = new Set(theirs.map((row) => row.merchantId));
      if (mine.some((row) => takenStores.has(row.merchantId))) {
        return false;
      }
      if (mine.length) {
        await members.update({ customerId: from.id }, { customerId: to.id });
      }
      await manager.getRepository(Customer).delete(from.id);
      this.logger.log(`顾客身份已合并 into=${to.id} from=${from.id} 迁移会员档案 ${mine.length} 份`);
      return true;
    });
  }

  private async issueFor(
    customer: Customer,
    member: Member,
    context: { merchant: Merchant; store: Store },
    result: { isNewMember?: boolean; phoneNote: string | null },
    sessionId?: string,
  ): Promise<ClientAuthResult> {
    const counts = await this.memberService.couponCounts(member.merchantId, member.id);
    const auth = sessionId
      ? await this.tokens.issueWithSession(this.toProfile(customer), sessionId)
      : await this.tokens.issue(this.toProfile(customer));
    return {
      ...auth,
      isNewMember: result.isNewMember ?? false,
      phoneNote: result.phoneNote,
      member: this.memberService.toBrief(member, customer, counts),
      store: this.stores.toView(context.merchant, context.store),
    };
  }

  private async requireCustomer(customerId: number): Promise<Customer> {
    const customer = await this.customers.findOne({ where: { id: customerId } });
    if (!customer) {
      throw new BusinessException('顾客账号不存在', 401);
    }
    return customer;
  }

  /** 平台级停用：整个微信账号都不能再用。 */
  private assertCustomerUsable(customer: Customer): void {
    if (customer.status !== MemberStatus.Active) {
      throw BusinessException.forbidden('账号已被停用，请联系平台客服');
    }
  }

  /** 门店级停用：只挡住这家店的会员身份，换一家照样能点单。 */
  private assertProfileUsable(member: Member): void {
    if (member.status !== MemberStatus.Active) {
      throw BusinessException.forbidden('会员账号已被店家停用，请联系门店');
    }
  }

  private toProfile(customer: Customer): AuthUserProfile {
    return {
      id: customer.id,
      // 令牌里不放 openid，用顾客 ID 派生一个稳定的展示名
      username: `customer_${customer.id}`,
      realName: customer.nickname,
      userType: UserType.Client,
      // 顾客不属于任何一家店：门店由每次请求的 merchantCode 决定
      merchantId: null,
      merchantName: null,
      role: CLIENT_ROLE,
      permissions: [],
    };
  }
}

/** 展示名兜底：有微信身份用 openid 尾号，纯手机号身份用手机号尾号，都不外泄完整值。 */
function defaultNickname(openid: string | null, phone: string | null): string {
  if (openid) {
    return `顾客${openid.slice(-4)}`;
  }
  return `顾客${(phone ?? '新会员').slice(-4)}`;
}

function isDuplicateEntry(error: QueryFailedError): boolean {
  const driverError = error as QueryFailedError & { code?: string; errno?: number };
  return driverError.code === DUPLICATE_ENTRY || driverError.errno === 1062;
}
