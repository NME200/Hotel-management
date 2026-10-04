import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, type FindOptionsWhere, Repository } from 'typeorm';
import { levelByGrowth } from '../../../common/constants/dict';
import { buildPageResult, type PageResult } from '../../../common/dto/page-result.dto';
import { toSkipTake } from '../../../common/dto/page-query.dto';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { likePattern } from '../../../common/utils/like.util';
import { maskPhone } from '../../../common/utils/mask.util';
import { Customer } from '../../../database/entities/customer.entity';
import { Member } from '../../../database/entities/member.entity';
import { Merchant } from '../../../database/entities/merchant.entity';
import type {
  CustomerQueryDto,
  MemberProfileQueryDto,
  UpdateCustomerDto,
  UpdateMemberProfileDto,
} from './dto/member.dto';

/** 顾客列表行：身份 + 跨店汇总。余额不按店求和——那是各商户自己的负债，加总没有意义。 */
export interface CustomerRow {
  id: number;
  nickname: string;
  phone: string | null;
  phoneMasked: string | null;
  avatar: string | null;
  gender: string;
  status: string;
  registerSource: string;
  createdAt: Date;
  /** 在几家店开过会员档案 */
  storeCount: number;
  /** 跨店累计订单数 */
  orderCount: number;
  lastOrderAt: Date | null;
}

/** 一家店里的会员档案：等级、成长值、余额都是这一家自己的。 */
export interface MemberProfileRow {
  id: number;
  merchantId: number;
  merchantName: string;
  /** 门店编号：平台端从这里跳回小程序那家店，冒烟脚本也用它定位是哪一家 */
  merchantCode: string;
  customerId: number;
  nickname: string;
  level: string;
  levelLabel: string;
  growthValue: number;
  points: number;
  balance: number;
  totalAmount: number;
  orderCount: number;
  status: string;
  remark: string | null;
  lastOrderAt: Date | null;
}

export interface CustomerDetail extends CustomerRow {
  profiles: MemberProfileRow[];
}

/**
 * 平台端会员管理。
 *
 * 会员管理从商家端搬到这里，是因为账号本身已经跨店了：一个微信顾客在 A 店被停用，
 * 不该影响他在 B 店下单；反过来平台要封一个刷券的账号，也不可能在每家店分别操作。
 * 所以这里分两层：customer 是账号（平台管），member 是某家店的档案（平台代商户管）。
 */
@Injectable()
export class PlatformMemberService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Member) private readonly members: Repository<Member>,
    @InjectRepository(Merchant) private readonly merchants: Repository<Merchant>,
  ) {}

  async pageCustomers(query: CustomerQueryDto): Promise<PageResult<CustomerRow>> {
    const base: FindOptionsWhere<Customer> = {
      ...(query.status ? { status: query.status } : {}),
    };

    const keyword = query.keyword?.trim();
    const pattern = keyword ? likePattern(keyword) : '';
    const where: FindOptionsWhere<Customer> | FindOptionsWhere<Customer>[] = keyword
      ? [
          { ...base, nickname: Like(pattern) },
          { ...base, phone: Like(pattern) },
          { ...base, openid: Like(pattern) },
        ]
      : base;

    const [rows, total] = await this.customers.findAndCount({
      where,
      order: { id: 'DESC' },
      ...toSkipTake(query.page, query.pageSize),
    });

    const profiles = rows.length
      ? await this.members.find({ where: { customerId: In(rows.map((row) => row.id)) } })
      : [];
    const grouped = profilesByCustomer(profiles);

    return buildPageResult(
      rows.map((row) => this.toCustomerRow(row, grouped.get(row.id) ?? [])),
      total,
      query.page,
      query.pageSize,
    );
  }

  async customerDetail(customerId: number): Promise<CustomerDetail> {
    const customer = await this.requireCustomer(customerId);
    const profiles = await this.members.find({
      where: { customerId },
      order: { id: 'ASC' },
    });
    return {
      ...this.toCustomerRow(customer, profiles),
      profiles: await this.toProfileRows(profiles),
    };
  }

  async updateCustomer(
    customerId: number,
    dto: UpdateCustomerDto,
  ): Promise<CustomerRow> {
    const customer = await this.requireCustomer(customerId);
    if (dto.status !== undefined && dto.status !== customer.status) {
      await this.customers.update(customer.id, { status: dto.status });
      customer.status = dto.status;
    }
    const profiles = await this.members.find({ where: { customerId: customer.id } });
    return this.toCustomerRow(customer, profiles);
  }

  /** 各店档案列表：平台运营按店筛会员时用，商家端不再提供这个入口。 */
  async pageProfiles(query: MemberProfileQueryDto): Promise<PageResult<MemberProfileRow>> {
    const [rows, total] = await this.members.findAndCount({
      where: {
        ...(query.merchantId ? { merchantId: query.merchantId } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.level ? { level: query.level } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      order: { id: 'DESC' },
      ...toSkipTake(query.page, query.pageSize),
    });
    return buildPageResult(
      await this.toProfileRows(rows),
      total,
      query.page,
      query.pageSize,
    );
  }

  async updateProfile(memberId: number, dto: UpdateMemberProfileDto): Promise<MemberProfileRow> {
    const member = await this.members.findOne({ where: { id: memberId } });
    if (!member) {
      throw BusinessException.notFound('会员档案不存在');
    }
    if (dto.remark !== undefined) member.remark = dto.remark;
    if (dto.status !== undefined) member.status = dto.status;
    await this.members.update(member.id, { remark: member.remark, status: member.status });
    const [row] = await this.toProfileRows([member]);
    return row;
  }

  private async requireCustomer(customerId: number): Promise<Customer> {
    const customer = await this.customers.findOne({ where: { id: customerId } });
    if (!customer) {
      throw BusinessException.notFound('顾客不存在');
    }
    return customer;
  }

  private toCustomerRow(customer: Customer, profiles: Member[]): CustomerRow {
    return {
      id: customer.id,
      nickname: customer.nickname,
      phone: customer.phone,
      phoneMasked: maskPhone(customer.phone),
      avatar: customer.avatar,
      gender: customer.gender,
      status: customer.status,
      registerSource: customer.registerSource,
      createdAt: customer.createdAt,
      storeCount: new Set(profiles.map((item) => item.merchantId)).size,
      orderCount: profiles.reduce((sum, item) => sum + item.orderCount, 0),
      lastOrderAt: latest(profiles.map((item) => item.lastOrderAt)),
    };
  }

  private async toProfileRows(profiles: Member[]): Promise<MemberProfileRow[]> {
    if (!profiles.length) {
      return [];
    }
    const merchantIds = [...new Set(profiles.map((item) => item.merchantId))];
    const customerIds = [...new Set(profiles.map((item) => item.customerId))];
    const [merchants, customers] = await Promise.all([
      this.merchants.find({ where: { id: In(merchantIds) } }),
      this.customers.find({ where: { id: In(customerIds) } }),
    ]);
    const nameById = new Map(merchants.map((item) => [item.id, item.name] as const));
    const codeById = new Map(merchants.map((item) => [item.id, item.code] as const));
    const customerById = new Map(customers.map((item) => [item.id, item] as const));
    return profiles.map((member) => {
      const rule = levelByGrowth(member.growthValue);
      return {
        id: member.id,
        merchantId: member.merchantId,
        merchantName: nameById.get(member.merchantId) ?? `商户 ${member.merchantId}`,
        merchantCode: codeById.get(member.merchantId) ?? '',
        customerId: member.customerId,
        nickname: customerById.get(member.customerId)?.nickname ?? '（账号已删除）',
        level: rule.level,
        levelLabel: rule.label,
        growthValue: member.growthValue,
        points: member.points,
        balance: member.balance,
        totalAmount: member.totalAmount,
        orderCount: member.orderCount,
        status: member.status,
        remark: member.remark,
        lastOrderAt: member.lastOrderAt,
      };
    });
  }
}

function profilesByCustomer(profiles: Member[]): Map<number, Member[]> {
  const grouped = new Map<number, Member[]>();
  for (const profile of profiles) {
    const list = grouped.get(profile.customerId) ?? [];
    list.push(profile);
    grouped.set(profile.customerId, list);
  }
  return grouped;
}

function latest(dates: (Date | null)[]): Date | null {
  let best: Date | null = null;
  for (const date of dates) {
    if (date && (!best || date.getTime() > best.getTime())) {
      best = date;
    }
  }
  return best;
}
