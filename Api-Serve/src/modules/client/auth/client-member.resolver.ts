import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { MemberLevel } from '../../../common/constants/dict';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { Member } from '../../../database/entities/member.entity';

const DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

/**
 * 「我在这家店」的档案解析。
 *
 * 登录身份是顾客级的（customer，openid 全局唯一），但等级、成长值、储值余额、券
 * 都是某一家店自己的经营数据，存在 member 上。所以每次带着门店上下文做业务时，
 * 都要把 (customerId, merchantId) 换成一条 member 档案。
 *
 * 建档时机刻意放在「真的要用到会员身份」的接口上（下单、领券、会员中心），
 * 而不是定店守卫里——顾客只是逛一下菜单不该在每家路过的店留下会员记录。
 */
@Injectable()
export class ClientMemberResolver {
  private readonly members: TenantRepo<Member>;

  constructor(
    @InjectRepository(Member) private readonly memberRepository: Repository<Member>,
  ) {
    this.members = new TenantRepo(memberRepository);
  }

  /** 只查不建：用于「登录了但还没在这家店开过会员」的个性化展示。 */
  find(merchantId: number, customerId: number): Promise<Member | null> {
    return this.members.findBy(merchantId, { customerId });
  }

  /**
   * 这个顾客在各家店的档案。跨店「我的订单」用它做归属校验：
   * 订单只认 member_id，而 member_id 属于谁由这张表说了算，
   * 所以不需要（也不应该）再额外要求请求带门店。
   */
  profilesOf(customerId: number): Promise<Member[]> {
    return this.memberRepository.find({ where: { customerId }, order: { id: 'ASC' } });
  }

  /** 取档案，没有就当场开一份（等级 normal、成长值 0）。 */
  async resolveOrCreate(merchantId: number, customerId: number): Promise<Member> {
    const existing = await this.find(merchantId, customerId);
    if (existing) {
      return existing;
    }
    try {
      return await this.members.create(merchantId, {
        customerId,
        level: MemberLevel.Normal,
      });
    } catch (error) {
      // 同一顾客同时在两家店并发下单时，唯一索引会撞；谁先落库谁生效，后到的回读
      if (error instanceof QueryFailedError && isDuplicateEntry(error)) {
        const raced = await this.find(merchantId, customerId);
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }

  /** 拿档案并且要求它属于这家店：读别人的 member.id 一律 403。 */
  async require(merchantId: number, memberId: number): Promise<Member> {
    const member = await this.members.findById(merchantId, memberId);
    if (!member) {
      throw BusinessException.forbidden('会员档案不存在');
    }
    return member;
  }
}

function isDuplicateEntry(error: QueryFailedError): boolean {
  const driverError = error as QueryFailedError & { code?: string; errno?: number };
  return driverError.code === DUPLICATE_ENTRY || driverError.errno === 1062;
}
