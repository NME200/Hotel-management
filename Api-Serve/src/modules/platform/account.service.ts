import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository, type FindOptionsSelect, type FindOptionsWhere } from 'typeorm';
import { AccountStatus } from '../../common/constants/dict';
import { toSkipTake, type PageQueryDto } from '../../common/dto/page-query.dto';
import { buildPageResult, type PageResult } from '../../common/dto/page-result.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { hashPassword } from '../../common/utils/password.util';
import { PlatformUser } from '../../database/entities/platform-user.entity';
import { likePattern } from '../../common/utils/like.util';
import type { AuditActor } from '../../common/models/audit-context';
import { AuditAction, AuditTargetType } from '../audit/constants/audit-action';
import { AuditService } from '../audit/audit.service';
import type { CreatePlatformAccountDto } from './dto/create-platform-account.dto';
import type { UpdatePlatformAccountDto } from './dto/update-platform-account.dto';
import {
  PLATFORM_ADMIN_ROLE,
  type PlatformAccountItem,
} from './models/platform-account.model';

/** 列表显式挑选可展示的字段，密码散列根本不进查询结果 */
const ACCOUNT_SELECT: FindOptionsSelect<PlatformUser> = {
  id: true,
  username: true,
  realName: true,
  phone: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  passwordHash: false,
};

/** 平台账号可改的字段：username 一经创建不可变更 */
type AccountChanges = Partial<
  Pick<PlatformUser, 'realName' | 'phone' | 'role' | 'status' | 'passwordHash'>
>;

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(PlatformUser)
    private readonly accounts: Repository<PlatformUser>,
    private readonly audit: AuditService,
  ) {}

  async page(query: PageQueryDto): Promise<PageResult<PlatformAccountItem>> {
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [rows, total] = await this.accounts.findAndCount({
      where: this.buildWhere(query.keyword),
      select: ACCOUNT_SELECT,
      order: { id: 'DESC' },
      skip,
      take,
    });

    return buildPageResult(
      rows.map((row) => this.toItem(row)),
      total,
      query.page,
      query.pageSize,
    );
  }

  async create(
    dto: CreatePlatformAccountDto,
    actor: AuditActor,
  ): Promise<PlatformAccountItem> {
    if (await this.accounts.exists({ where: { username: dto.username } })) {
      throw BusinessException.conflict('平台账号已存在');
    }

    const passwordHash = await hashPassword(dto.password);
    const account = await this.accounts.save(
      this.accounts.create({
        username: dto.username,
        passwordHash,
        realName: dto.realName,
        phone: dto.phone ?? null,
        role: dto.role,
        status: AccountStatus.Active,
      }),
    );
    await this.audit.record(actor, {
      action: AuditAction.AccountCreate,
      targetType: AuditTargetType.Account,
      targetId: account.id,
      targetName: account.username,
      detail: { role: account.role },
    });
    return this.toItem(account);
  }

  /** 更新与重置密码、禁用共用：status 传 disabled 即禁用账号 */
  async update(
    id: number,
    dto: UpdatePlatformAccountDto,
    actor: AuditActor,
  ): Promise<PlatformAccountItem> {
    const account = await this.findAccount(id);
    await this.assertNotLastAdmin(account, dto);

    const changes: AccountChanges = {};
    if (dto.realName !== undefined) {
      changes.realName = dto.realName;
    }
    if (dto.phone !== undefined) {
      changes.phone = dto.phone;
    }
    if (dto.role !== undefined) {
      changes.role = dto.role;
    }
    if (dto.status !== undefined) {
      changes.status = dto.status;
    }
    if (dto.password !== undefined) {
      changes.passwordHash = await hashPassword(dto.password);
    }
    if (Object.keys(changes).length === 0) {
      throw BusinessException.badRequest('没有需要更新的字段');
    }

    Object.assign(account, changes);
    const saved = await this.accounts.save(account);
    const changedFields = Object.keys(changes);
    await this.audit.record(actor, {
      action:
        dto.password !== undefined ? AuditAction.AccountPassword : AuditAction.AccountUpdate,
      targetType: AuditTargetType.Account,
      targetId: saved.id,
      targetName: saved.username,
      detail: {
        fields: changedFields.filter((field) => field !== 'passwordHash'),
        role: saved.role,
        status: saved.status,
      },
    });
    return this.toItem(saved);
  }

  private async findAccount(id: number): Promise<PlatformUser> {
    const account = await this.accounts.findOne({ where: { id } });
    if (!account) {
      throw BusinessException.notFound('平台账号不存在');
    }
    return account;
  }

  /**
   * 兜底保护：平台不能没有可用超级管理员。
   * 只有当本次操作确实会减少一个「启用中的超管」时才计数拦截。
   */
  private async assertNotLastAdmin(
    account: PlatformUser,
    dto: UpdatePlatformAccountDto,
  ): Promise<void> {
    const isDemoting = dto.role !== undefined && dto.role !== PLATFORM_ADMIN_ROLE;
    const isDisabling = dto.status === AccountStatus.Disabled;
    if (!isDemoting && !isDisabling) {
      return;
    }
    if (account.role !== PLATFORM_ADMIN_ROLE || account.status !== AccountStatus.Active) {
      return;
    }

    const activeAdmins = await this.accounts.count({
      where: { role: PLATFORM_ADMIN_ROLE, status: AccountStatus.Active },
    });
    if (activeAdmins <= 1) {
      throw BusinessException.badRequest('至少保留一个平台超级管理员');
    }
  }

  private buildWhere(
    keyword: string | undefined,
  ): FindOptionsWhere<PlatformUser>[] | undefined {
    const trimmed = keyword?.trim();
    if (!trimmed) {
      return undefined;
    }
    const pattern = Like(likePattern(trimmed));
    return [{ username: pattern }, { realName: pattern }];
  }

  /** 唯一出口：无论查询是否带出 passwordHash，返回体里都不会有它 */
  private toItem(account: PlatformUser): PlatformAccountItem {
    return {
      id: account.id,
      username: account.username,
      realName: account.realName,
      phone: account.phone ?? null,
      role: account.role,
      status: account.status,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }
}
