import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThanOrEqual, Like, Repository, type FindOptionsWhere } from 'typeorm';
import { addDays, startOfDay } from '../../common/utils/date.util';
import {
  AccountStatus,
  MerchantStatus,
  StaffRole,
  StoreStatus,
} from '../../common/constants/dict';
import { toSkipTake } from '../../common/dto/page-query.dto';
import { buildPageResult, type PageResult } from '../../common/dto/page-result.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { hashPassword } from '../../common/utils/password.util';
import { likePattern } from '../../common/utils/like.util';
import type { AuditActor } from '../../common/models/audit-context';
import { AuditTargetType } from '../audit/constants/audit-action';
import { AuditAction } from '../audit/constants/audit-action';
import { AuditService } from '../audit/audit.service';
import { Merchant } from '../../database/entities/merchant.entity';
import { MerchantPaymentConfig } from '../../database/entities/merchant-payment-config.entity';
import { MerchantStaff } from '../../database/entities/merchant-staff.entity';
import { Store } from '../../database/entities/store.entity';
import { PaymentChannel } from '../payment/constants/payment.constant';
import { CHANNEL_LABELS } from '../payment/models/payment-config.model';
import type { CreateMerchantDto } from './dto/create-merchant.dto';
import type { MerchantQueryDto } from './dto/merchant-query.dto';
import type { ChannelCommissionDto, UpdateMerchantDto } from './dto/update-merchant.dto';
import type { UpdateMerchantStatusDto } from './dto/update-merchant-status.dto';
import type {
  ExpiringMerchant,
  MerchantChannelCommission,
  MerchantDetail,
  MerchantListItem,
  StoreBrief,
} from './models/merchant-view.model';

/** 新建商户的默认营业时段，开店后由商户在商家端自行调整 */
const DEFAULT_BUSINESS_HOURS = ['10:00-14:00', '17:00-21:00'];

/**
 * 参与抽佣的渠道。模拟渠道是平台自有的联调通道，不产生真实资金流，因此不纳入定价。
 * 类型收窄成 ChannelCommissionDto 的键，这样 input[channel] 才是类型安全的。
 */
const COMMISSION_CHANNELS = [
  PaymentChannel.Wechat,
  PaymentChannel.Alipay,
] as const satisfies readonly (keyof ChannelCommissionDto)[];

type CommissionChannel = (typeof COMMISSION_CHANNELS)[number];

/** 'YYYY-MM-DD' / 'YYYY-MM-DD HH:mm:ss' 按本地时区解析，带 T 的 ISO 串交给 Date 处理 */
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:[ ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/** 商户资料里平台端可改的字段 */
type MerchantProfileChanges = Partial<
  Pick<
    Merchant,
    'name' | 'contactName' | 'contactPhone' | 'logo' | 'remark' | 'expireAt'
  >
>;

@Injectable()
export class MerchantService {
  constructor(
    @InjectRepository(Merchant)
    private readonly merchants: Repository<Merchant>,
    @InjectRepository(Store)
    private readonly stores: Repository<Store>,
    @InjectRepository(MerchantStaff)
    private readonly staffs: Repository<MerchantStaff>,
    @InjectRepository(MerchantPaymentConfig)
    private readonly commissionConfigs: Repository<MerchantPaymentConfig>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async page(query: MerchantQueryDto): Promise<PageResult<MerchantListItem>> {
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [rows, total] = await this.merchants.findAndCount({
      where: this.buildWhere(query.keyword, query.status),
      order: { id: 'DESC' },
      skip,
      take,
    });

    const merchantIds = rows.map((row) => row.id);
    const [staffCounts, storeNames] = await Promise.all([
      this.loadStaffCounts(merchantIds),
      this.loadStoreNames(merchantIds),
    ]);

    const list = rows.map((row) =>
      this.toListItem(row, staffCounts.get(row.id) ?? 0, storeNames.get(row.id) ?? null),
    );
    return buildPageResult(list, total, query.page, query.pageSize);
  }

  async detail(id: number): Promise<MerchantDetail> {
    const merchant = await this.findMerchant(id);
    const [store, staffCount, commissions] = await Promise.all([
      this.stores.findOne({ where: { merchantId: id } }),
      this.staffs.count({ where: { merchantId: id } }),
      this.loadCommissions(id),
    ]);

    return {
      ...this.toListItem(merchant, staffCount, store?.name ?? null),
      updatedAt: merchant.updatedAt,
      auditedAt: merchant.auditedAt,
      auditRemark: merchant.auditRemark,
      store: store ? this.toStoreBrief(store) : null,
      commissions,
    };
  }

  /**
   * 固定返回微信与支付宝两条，未进件的渠道 configured=false。
   *
   * 这里不做「合成 not_applied」以外的补全 —— 没有进件记录就是不返回行，
   * 因为写抽佣时确实没有行可写，界面必须提前知道哪条渠道能改。
   */
  private async loadCommissions(merchantId: number): Promise<MerchantChannelCommission[]> {
    const rows = await this.commissionConfigs.find({
      where: { merchantId, channel: In([...COMMISSION_CHANNELS]) },
    });
    const byChannel = new Map(rows.map((row) => [row.channel, row] as const));

    return COMMISSION_CHANNELS.map((channel) => {
      const row = byChannel.get(channel) ?? null;
      return {
        channel,
        channelLabel: CHANNEL_LABELS[channel],
        configured: row !== null,
        profitShareRate: row?.profitShareRate ?? null,
        status: row?.status ?? 'not_applied',
      };
    });
  }

  /**
   * 开通商户：商户 + 管理员员工账号 + 默认门店一次成型，
   * 三者必须同事务，避免出现能查到但没有账号的空壳商户。
   */
  async create(dto: CreateMerchantDto, actor: AuditActor): Promise<MerchantDetail> {
    if (await this.merchants.exists({ where: { code: dto.code } })) {
      throw BusinessException.conflict('商户编号已存在');
    }
    const passwordHash = await hashPassword(dto.adminPassword);
    const expireAt = this.toExpireAt(dto.expireAt);

    const merchantId = await this.dataSource.transaction(async (manager) => {
      const merchant = await manager.save(
        manager.create(Merchant, {
          code: dto.code,
          name: dto.name,
          contactName: dto.contactName,
          contactPhone: dto.contactPhone,
          logo: dto.logo ?? null,
          remark: dto.remark ?? null,
          expireAt,
          status: MerchantStatus.PendingAudit,
        }),
      );

      await manager.save(
        manager.create(MerchantStaff, {
          merchantId: merchant.id,
          username: dto.adminUsername,
          passwordHash,
          realName: dto.adminRealName,
          phone: dto.contactPhone,
          role: StaffRole.Owner,
          status: AccountStatus.Active,
        }),
      );

      await manager.save(
        manager.create(Store, {
          merchantId: merchant.id,
          name: dto.name,
          businessHours: [...DEFAULT_BUSINESS_HOURS],
          status: StoreStatus.Closed,
        }),
      );

      return merchant.id;
    });

    await this.audit.record(actor, {
      action: AuditAction.MerchantCreate,
      targetType: AuditTargetType.Merchant,
      targetId: merchantId,
      targetName: dto.name,
      detail: {
        code: dto.code,
        ownerUsername: dto.adminUsername,
        expireAt: expireAt ? expireAt.toISOString() : null,
      },
    });

    return this.detail(merchantId);
  }

  async update(
    id: number,
    dto: UpdateMerchantDto,
    actor: AuditActor,
  ): Promise<MerchantDetail> {
    const merchant = await this.findMerchant(id);
    const changes: MerchantProfileChanges = {};

    if (dto.name !== undefined) {
      changes.name = dto.name;
    }
    if (dto.contactName !== undefined) {
      changes.contactName = dto.contactName;
    }
    if (dto.contactPhone !== undefined) {
      changes.contactPhone = dto.contactPhone;
    }
    if (dto.logo !== undefined) {
      changes.logo = dto.logo;
    }
    if (dto.remark !== undefined) {
      changes.remark = dto.remark;
    }
    if (dto.expireAt !== undefined) {
      changes.expireAt = this.toExpireAt(dto.expireAt);
    }

    // 抽佣单独走一条审计与一条事务，不与基础资料混在一起
    const rateChanges = await this.applyCommissionRates(id, dto.profitShareRates);

    if (Object.keys(changes).length === 0 && rateChanges.length === 0) {
      throw BusinessException.badRequest('没有需要更新的字段');
    }

    if (Object.keys(changes).length > 0) {
      Object.assign(merchant, changes);
      await this.merchants.save(merchant);
      await this.audit.record(actor, {
        action: AuditAction.MerchantUpdate,
        targetType: AuditTargetType.Merchant,
        targetId: id,
        targetName: merchant.name,
        detail: this.serializeChanges(changes),
      });
    }

    if (rateChanges.length > 0) {
      await this.audit.record(actor, {
        action: AuditAction.MerchantProfitShareRate,
        targetType: AuditTargetType.Merchant,
        targetId: id,
        targetName: merchant.name,
        // 改前值必留，否则事后无法回答「这费率是谁什么时候调的」
        detail: { changes: rateChanges },
      });
    }

    return this.detail(id);
  }

  /**
   * 写入分渠道抽佣比例，返回实际发生变化的条目（供审计）。
   *
   * 三条规则：
   * 1. 只更新已存在的进件行 —— 没有进件记录就没有可写的载体，直接报错而不是静默跳过，
   *    否则运营会以为设置成功了。
   * 2. 与已有值相同的不写、不进审计，避免「点一下确定就多一条审计」。
   * 3. 批量写在同一个事务里，中途失败不会出现微信改了支付宝没改的半截状态。
   */
  private async applyCommissionRates(
    merchantId: number,
    input: ChannelCommissionDto | undefined,
  ): Promise<{ channel: string; from: number | null; to: number | null }[]> {
    if (input === undefined) {
      return [];
    }

    const entries: { channel: CommissionChannel; next: number | null }[] =
      COMMISSION_CHANNELS.filter((channel) => input[channel] !== undefined).map(
        (channel) => ({ channel, next: input[channel] ?? null }),
      );

    if (entries.length === 0) {
      return [];
    }

    const rows = await this.commissionConfigs.find({
      where: { merchantId, channel: In(entries.map((entry) => entry.channel)) },
    });
    const byChannel = new Map(rows.map((row) => [row.channel, row] as const));

    // 先整批校验，避免部分写成功后才在第二条上报错
    for (const entry of entries) {
      if (!byChannel.has(entry.channel)) {
        throw BusinessException.badRequest(
          `该商户尚未提交${CHANNEL_LABELS[entry.channel]}进件，无法设置抽佣比例；请先在「商户支付进件」审核开通后再设置`,
        );
      }
    }

    const changed: { channel: string; from: number | null; to: number | null }[] = [];
    const pending: MerchantPaymentConfig[] = [];
    for (const entry of entries) {
      const row = byChannel.get(entry.channel)!;
      const from = row.profitShareRate;
      // decimalTransformer 取回来是 number，直接比较即可
      if (from === entry.next) {
        continue;
      }
      row.profitShareRate = entry.next;
      pending.push(row);
      changed.push({ channel: entry.channel, from, to: entry.next });
    }

    if (pending.length > 0) {
      await this.dataSource.transaction(async (manager) => {
        await manager.save(pending);
      });
    }
    return changed;
  }

  async updateStatus(
    id: number,
    dto: UpdateMerchantStatusDto,
    actor: AuditActor,
  ): Promise<MerchantDetail> {
    const merchant = await this.findMerchant(id);
    const previousStatus = merchant.status;
    merchant.status = dto.status;
    if (dto.status === MerchantStatus.Active && merchant.auditedAt === null) {
      merchant.auditedAt = new Date();
    }
    await this.merchants.save(merchant);
    await this.audit.record(actor, {
      action: AuditAction.MerchantStatus,
      targetType: AuditTargetType.Merchant,
      targetId: id,
      targetName: merchant.name,
      detail: { from: previousStatus, to: dto.status },
    });
    return this.detail(id);
  }

  /** Date 等非 JSON 值转成字符串，避免落进 simple-json 列时结构不一致。 */
  private serializeChanges(
    changes: MerchantProfileChanges,
  ): Record<string, unknown> {
    const detail: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(changes)) {
      detail[key] = value instanceof Date ? value.toISOString() : value ?? null;
    }
    return detail;
  }

  /**
   * 到期预警列表：days 天内到期（含已过期）。
   * expireAt 为 NULL 表示不限期，NULL 参与比较恒为假，天然被排除。
   */
  async expiring(days: number): Promise<ExpiringMerchant[]> {
    const today = startOfDay(new Date());
    const merchants = await this.merchants.find({
      where: { expireAt: LessThanOrEqual(addDays(today, days)) },
      order: { expireAt: 'ASC' },
    });

    return merchants.map((merchant) => ({
      id: merchant.id,
      code: merchant.code,
      name: merchant.name,
      status: merchant.status,
      expireAt: merchant.expireAt as Date,
      daysLeft: Math.round(
        (startOfDay(merchant.expireAt as Date).getTime() - today.getTime()) /
          (24 * 60 * 60 * 1000),
      ),
    }));
  }

  private async findMerchant(id: number): Promise<Merchant> {
    const merchant = await this.merchants.findOne({ where: { id } });
    if (!merchant) {
      throw BusinessException.notFound('商户不存在');
    }
    return merchant;
  }

  /** keyword 命中名称/编号/联系人/电话任一字段；带 status 时每个 OR 分支都要带上状态 */
  private buildWhere(
    keyword: string | undefined,
    status: MerchantStatus | undefined,
  ): FindOptionsWhere<Merchant> | FindOptionsWhere<Merchant>[] {
    const statusCondition: FindOptionsWhere<Merchant> =
      status === undefined ? {} : { status };
    if (keyword === undefined || keyword.trim() === '') {
      return statusCondition;
    }

    const pattern = Like(likePattern(keyword));
    return [
      { ...statusCondition, name: pattern },
      { ...statusCondition, code: pattern },
      { ...statusCondition, contactName: pattern },
      { ...statusCondition, contactPhone: pattern },
    ];
  }

  /** 批量统计员工数：一次查出本页商户的员工，在内存里按商户计数，避免循环查库 */
  private async loadStaffCounts(merchantIds: number[]): Promise<Map<number, number>> {
    if (merchantIds.length === 0) {
      return new Map();
    }
    const staffs = await this.staffs.find({
      where: { merchantId: In(merchantIds) },
      select: { id: true, merchantId: true },
    });

    const counts = new Map<number, number>();
    for (const staff of staffs) {
      counts.set(staff.merchantId, (counts.get(staff.merchantId) ?? 0) + 1);
    }
    return counts;
  }

  /** 一个商户一个门店，同样用一次 In 查询拿齐本页门店名 */
  private async loadStoreNames(merchantIds: number[]): Promise<Map<number, string>> {
    if (merchantIds.length === 0) {
      return new Map();
    }
    const stores = await this.stores.find({
      where: { merchantId: In(merchantIds) },
      select: { merchantId: true, name: true },
    });
    return new Map(stores.map((store) => [store.merchantId, store.name] as const));
  }

  private toListItem(
    merchant: Merchant,
    staffCount: number,
    storeName: string | null,
  ): MerchantListItem {
    return {
      id: merchant.id,
      code: merchant.code,
      name: merchant.name,
      contactName: merchant.contactName,
      contactPhone: merchant.contactPhone,
      logo: merchant.logo,
      status: merchant.status,
      expireAt: merchant.expireAt,
      remark: merchant.remark,
      createdAt: merchant.createdAt,
      storeName,
      staffCount,
    };
  }

  private toStoreBrief(store: Store): StoreBrief {
    return {
      id: store.id,
      name: store.name,
      status: store.status,
      logo: store.logo,
      province: store.province,
      city: store.city,
      district: store.district,
      address: store.address,
      phone: store.phone,
      notice: store.notice,
      businessHours: store.businessHours,
    };
  }

  /** 到期时间：空串表示不限期/清除，本地格式手写解析以免被当成 UTC 偏移 8 小时 */
  private toExpireAt(value?: string): Date | null {
    const input = value?.trim();
    if (!input) {
      return null;
    }

    const matched = LOCAL_DATE_TIME.exec(input);
    if (matched) {
      const [, year, month, day, hour = '0', minute = '0', second = '0'] = matched;
      return new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      );
    }

    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) {
      throw BusinessException.badRequest('到期时间格式不正确');
    }
    return parsed;
  }
}
