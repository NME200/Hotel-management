import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';
import { MEMBER_LEVEL_RULES } from '../../../common/constants/dict';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { maskPhone } from '../../../common/utils/mask.util';
import { toYuan } from '../../../common/utils/money.util';
import { Customer } from '../../../database/entities/customer.entity';
import { Member } from '../../../database/entities/member.entity';
import type { CashierMemberView } from './models/cashier.model';

/**
 * 收银台按手机号认会员。
 *
 * 只读、只回脱敏信息：收银员需要的是「是不是会员、什么等级、能享什么价」，
 * 不需要（也不该看到）顾客的完整手机号与跨店消费记录。
 *
 * 这里刻意不自动建会员档案：一次查询顺手写库会让「查一下」变成有副作用的动作，
 * 而是否要把散客发展成会员是经营决策，不是收银动作。
 */
@Injectable()
export class CashierMemberService {
  private readonly members: TenantRepo<Member>;

  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Member) memberRepository: Repository<Member>,
  ) {
    this.members = new TenantRepo(memberRepository);
  }

  /** 查不到顾客返回 null；顾客存在但不是本店会员时返回带 hint 的结果。 */
  async lookup(merchantId: number, phone: string): Promise<CashierMemberView | null> {
    const customer = await this.customers.findOne({ where: { phone: phone.trim() } });
    if (!customer) {
      return null;
    }

    const member = await this.members.findBy(merchantId, { customerId: customer.id });
    const rule = member
      ? MEMBER_LEVEL_RULES.find((item) => item.level === member.level) ?? null
      : null;

    return {
      customerId: customer.id,
      memberId: member?.id ?? null,
      nickname: customer.nickname,
      phoneMasked: maskPhone(customer.phone) ?? '',
      isMember: member !== null,
      level: member?.level ?? null,
      levelLabel: rule?.label ?? null,
      points: member?.points ?? null,
      balance: member ? toYuan(member.balance) : null,
      hint: member ? null : '该手机号尚未注册为本店会员，将按原价结算',
    };
  }
}
