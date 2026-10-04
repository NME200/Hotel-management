import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AccountStatus,
  MerchantStatus,
  UserType,
} from '../../common/constants/dict';
import { CacheKey } from '../../common/constants/cache-key';
import { Permission, resolvePermissions } from '../../common/constants/permission';
import { BusinessException } from '../../common/exceptions/business.exception';
import type { AuthUser } from '../../common/models/auth-context';
import { hashPassword, verifyPassword } from '../../common/utils/password.util';
import type { AuditActor } from '../../common/models/audit-context';
import { AuditAction, AuditTargetType } from '../audit/constants/audit-action';
import { AuditService } from '../audit/audit.service';
import { Merchant } from '../../database/entities/merchant.entity';
import { MerchantStaff } from '../../database/entities/merchant-staff.entity';
import { PlatformUser } from '../../database/entities/platform-user.entity';
import { RedisService } from '../redis/redis.service';
import type {
  ChangePasswordDto,
  MerchantLoginDto,
  PlatformLoginDto,
  RefreshTokenDto,
} from './dto/login.dto';
import type { AuthResult, AuthUserProfile } from './models/auth-result.model';
import { TokenService } from './token.service';

const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_SECONDS = 600;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(PlatformUser)
    private readonly platformUsers: Repository<PlatformUser>,
    @InjectRepository(MerchantStaff)
    private readonly staffs: Repository<MerchantStaff>,
    @InjectRepository(Merchant)
    private readonly merchants: Repository<Merchant>,
    private readonly tokenService: TokenService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  async loginByMerchant(dto: MerchantLoginDto): Promise<AuthResult> {
    return this.authenticateStaff(dto, null);
  }

  /**
   * 收银台（CM-web）登录：在普通商户登录之上多一道权限闸门。
   *
   * 权限校验刻意放在**密码验证之后**：先验密码再判权限，
   * 否则「这个账号存不存在」会从 403 与 401 的差别里泄露出去。
   *
   * 无权限时**不累加失败计数** —— 密码是对的，只是没这个角色，
   * 把它算作登录失败会让收银员试几次就被锁 10 分钟。
   */
  async loginByCashier(dto: MerchantLoginDto): Promise<AuthResult> {
    return this.authenticateStaff(dto, {
      permission: Permission.CashierUse,
      message: '该账号没有收银台权限，请联系店长在「员工管理」中调整为收银员或以上角色',
    });
  }

  private async authenticateStaff(
    dto: MerchantLoginDto,
    requirement: { permission: Permission; message: string } | null,
  ): Promise<AuthResult> {
    const failureKey = CacheKey.loginFailure(`merchant:${dto.merchantCode}:${dto.username}`);
    await this.assertNotLocked(failureKey);

    const merchant = await this.merchants.findOne({ where: { code: dto.merchantCode } });
    if (!merchant) {
      await this.recordFailure(failureKey);
      throw new BusinessException('商户编号或密码错误', HttpStatus.UNAUTHORIZED);
    }
    this.assertMerchantUsable(merchant);

    const staff = await this.staffs.findOne({
      where: { merchantId: merchant.id, username: dto.username },
    });
    const passwordOk =
      staff !== null &&
      staff.status === AccountStatus.Active &&
      (await verifyPassword(dto.password, staff.passwordHash));

    if (!staff || !passwordOk) {
      await this.recordFailure(failureKey);
      throw new BusinessException('商户编号或密码错误', HttpStatus.UNAUTHORIZED);
    }

    if (requirement) {
      const permissions = resolvePermissions(UserType.Merchant, staff.role);
      if (!permissions.includes(requirement.permission)) {
        throw new BusinessException(requirement.message, HttpStatus.FORBIDDEN);
      }
    }

    await this.redis.del(failureKey);
    staff.lastLoginAt = new Date();
    await this.staffs.save(staff);

    return this.tokenService.issue(this.buildStaffProfile(staff, merchant.name));
  }

  async loginByPlatform(
    dto: PlatformLoginDto,
    actor: AuditActor,
  ): Promise<AuthResult> {
    const failureKey = CacheKey.loginFailure(`platform:${dto.username}`);
    await this.assertNotLocked(failureKey);

    const account = await this.platformUsers.findOne({ where: { username: dto.username } });
    const passwordOk =
      account !== null &&
      account.status === AccountStatus.Active &&
      (await verifyPassword(dto.password, account.passwordHash));

    if (!account || !passwordOk) {
      await this.recordFailure(failureKey);
      await this.audit.record(actor, {
        action: AuditAction.PlatformLoginFailed,
        targetType: AuditTargetType.Auth,
        targetName: dto.username,
        detail: { reason: account ? '密码错误或账号已停用' : '账号不存在' },
      });
      throw new BusinessException('账号或密码错误', HttpStatus.UNAUTHORIZED);
    }

    await this.redis.del(failureKey);
    const profile = this.buildPlatformProfile(account);
    await this.audit.record({ ...actor, operatorId: account.id, operatorName: profile.realName }, {
      action: AuditAction.PlatformLogin,
      targetType: AuditTargetType.Auth,
      targetId: account.id,
      targetName: account.username,
      detail: { role: account.role },
    });
    return this.tokenService.issue(profile);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResult> {
    const session = await this.tokenService.readSession(dto.refreshToken);
    const profile = await this.loadProfile(session.userType, session.sub);
    return this.tokenService.issueWithSession(profile, session.sessionId);
  }

  async logout(user: AuthUser, actor: AuditActor): Promise<void> {
    await this.tokenService.revoke(user.sessionId);
    if (user.userType === UserType.Platform) {
      await this.audit.record(actor, {
        action: AuditAction.PlatformLogout,
        targetType: AuditTargetType.Auth,
        targetId: user.id,
        targetName: user.username,
      });
    }
  }

  async profileOf(user: AuthUser): Promise<AuthUserProfile> {
    return this.loadProfile(user.userType, user.id);
  }

  /** 本人改密，不需要员工管理权限，改完作废会话，强制重新登录。 */
  async changePassword(
    user: AuthUser,
    dto: ChangePasswordDto,
    actor: AuditActor,
  ): Promise<null> {
    if (user.userType === UserType.Platform) {
      const account = await this.platformUsers.findOne({ where: { id: user.id } });
      if (!account) {
        throw BusinessException.notFound('账号不存在');
      }
      if (!(await verifyPassword(dto.oldPassword, account.passwordHash))) {
        throw BusinessException.badRequest('原密码不正确');
      }
      account.passwordHash = await hashPassword(dto.newPassword);
      await this.platformUsers.save(account);
    } else {
      const staff = await this.staffs.findOne({ where: { id: user.id } });
      if (!staff) {
        throw BusinessException.notFound('账号不存在');
      }
      if (!(await verifyPassword(dto.oldPassword, staff.passwordHash))) {
        throw BusinessException.badRequest('原密码不正确');
      }
      staff.passwordHash = await hashPassword(dto.newPassword);
      await this.staffs.save(staff);
    }

    if (user.userType === UserType.Platform) {
      await this.audit.record(actor, {
        action: AuditAction.PlatformPasswordChanged,
        targetType: AuditTargetType.Auth,
        targetId: user.id,
        targetName: user.username,
      });
    }
    await this.tokenService.revoke(user.sessionId);
    return null;
  }

  private async loadProfile(
    userType: UserType,
    id: number,
  ): Promise<AuthUserProfile> {
    if (userType === UserType.Client) {
      // 顾客令牌只能走 /client/auth/refresh：这里的会员查不到对应后台账号，
      // 混用会把顾客 ID 当成员工 ID 去查，报出一个误导性的「账号不可用」。
      throw new BusinessException('该令牌不能用于后台账号接口', HttpStatus.UNAUTHORIZED);
    }
    if (userType === UserType.Platform) {
      const account = await this.platformUsers.findOne({ where: { id } });
      if (!account || account.status !== AccountStatus.Active) {
        throw new BusinessException('账号不可用', HttpStatus.UNAUTHORIZED);
      }
      return this.buildPlatformProfile(account);
    }

    const staff = await this.staffs.findOne({ where: { id } });
    if (!staff || staff.status !== AccountStatus.Active) {
      throw new BusinessException('账号不可用', HttpStatus.UNAUTHORIZED);
    }
    const merchant = await this.merchants.findOne({ where: { id: staff.merchantId } });
    if (!merchant) {
      throw new NotFoundException('所属商户不存在');
    }
    this.assertMerchantUsable(merchant);
    return this.buildStaffProfile(staff, merchant.name);
  }

  private assertMerchantUsable(merchant: Merchant): void {
    if (merchant.status !== MerchantStatus.Active) {
      throw new BusinessException('商户状态不可用，请联系平台运营', HttpStatus.FORBIDDEN);
    }
    if (merchant.expireAt !== null && merchant.expireAt.getTime() < Date.now()) {
      throw new BusinessException('商户服务已到期，请续费后使用', HttpStatus.FORBIDDEN);
    }
  }

  private buildStaffProfile(staff: MerchantStaff, merchantName: string): AuthUserProfile {
    return {
      id: staff.id,
      username: staff.username,
      realName: staff.realName,
      userType: UserType.Merchant,
      merchantId: staff.merchantId,
      merchantName,
      role: staff.role,
      permissions: [...resolvePermissions(UserType.Merchant, staff.role)],
    };
  }

  private buildPlatformProfile(account: PlatformUser): AuthUserProfile {
    return {
      id: account.id,
      username: account.username,
      realName: account.realName,
      userType: UserType.Platform,
      merchantId: null,
      merchantName: null,
      role: account.role,
      permissions: [...resolvePermissions(UserType.Platform, account.role)],
    };
  }

  private async assertNotLocked(failureKey: string): Promise<void> {
    const failures = await this.redis.getJson<number>(failureKey);
    if (failures !== null && failures >= MAX_LOGIN_FAILURES) {
      throw new BusinessException(
        '登录失败次数过多，请 10 分钟后再试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordFailure(failureKey: string): Promise<void> {
    await this.redis.incrementWithTtl(failureKey, LOGIN_LOCK_SECONDS);
  }
}
