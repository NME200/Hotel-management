import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, type FindOptionsWhere, type Repository } from 'typeorm';
import { AccountStatus, StaffRole } from '../../../common/constants/dict';
import type { PageResult } from '../../../common/dto/page-result.dto';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { likePattern } from '../../../common/utils/like.util';
import { hashPassword } from '../../../common/utils/password.util';
import { MerchantStaff } from '../../../database/entities/merchant-staff.entity';
import {
  type CreateStaffDto,
  type ResetStaffPasswordDto,
  type StaffQueryDto,
  type StaffView,
  type UpdateStaffDto,
} from './dto/staff.dto';

@Injectable()
export class StaffService {
  private readonly staffs: TenantRepo<MerchantStaff>;

  constructor(@InjectRepository(MerchantStaff) repository: Repository<MerchantStaff>) {
    this.staffs = new TenantRepo(repository);
  }

  async page(merchantId: number, query: StaffQueryDto): Promise<PageResult<StaffView>> {
    const keyword = query.keyword?.trim();
    const base: FindOptionsWhere<MerchantStaff> = query.role ? { role: query.role } : {};
    const where: FindOptionsWhere<MerchantStaff> | FindOptionsWhere<MerchantStaff>[] = keyword
      ? [
          { ...base, username: Like(likePattern(keyword)) },
          { ...base, realName: Like(likePattern(keyword)) },
          { ...base, phone: Like(likePattern(keyword)) },
        ]
      : base;

    const result = await this.staffs.page(merchantId, query, { where, order: { id: 'ASC' } });
    return { ...result, list: result.list.map((staff) => this.toView(staff)) };
  }

  async create(merchantId: number, dto: CreateStaffDto): Promise<StaffView> {
    if (await this.staffs.exists(merchantId, { username: dto.username })) {
      throw BusinessException.conflict('该登录账号已存在');
    }
    const { password, ...rest } = dto;
    const created = await this.staffs.create(merchantId, {
      ...rest,
      passwordHash: await hashPassword(password),
    });
    return this.toView(created);
  }

  async update(
    merchantId: number,
    id: number,
    dto: UpdateStaffDto,
  ): Promise<StaffView> {
    const staff = await this.staffs.findById(merchantId, id);
    if (dto.role && dto.role !== StaffRole.Owner && staff.role === StaffRole.Owner) {
      await this.assertNotLastOwner(merchantId, staff);
    }
    if (dto.status === AccountStatus.Disabled && staff.role === StaffRole.Owner) {
      await this.assertNotLastOwner(merchantId, staff);
    }
    const updated = await this.staffs.update(merchantId, id, dto);
    return this.toView(updated);
  }

  async resetPassword(
    merchantId: number,
    id: number,
    dto: ResetStaffPasswordDto,
  ): Promise<null> {
    await this.staffs.findById(merchantId, id);
    await this.staffs.update(merchantId, id, {
      passwordHash: await hashPassword(dto.password),
    });
    return null;
  }

  async remove(
    merchantId: number,
    id: number,
    operatorId: number,
  ): Promise<null> {
    const staff = await this.staffs.findById(merchantId, id);
    if (staff.id === operatorId) {
      throw BusinessException.badRequest('不能删除当前登录的账号');
    }
    if (staff.role === StaffRole.Owner) {
      await this.assertNotLastOwner(merchantId, staff);
    }
    await this.staffs.removeEntity(staff);
    return null;
  }

  private async assertNotLastOwner(
    merchantId: number,
    staff: MerchantStaff,
  ): Promise<void> {
    if (staff.role !== StaffRole.Owner) {
      return;
    }
    const owners = await this.staffs.count(merchantId, {
      role: StaffRole.Owner,
      status: AccountStatus.Active,
    });
    if (owners <= 1) {
      throw BusinessException.badRequest('必须保留一个可用的老板账号');
    }
  }

  private toView(staff: MerchantStaff): StaffView {
    const { passwordHash, ...rest } = staff;
    return rest;
  }
}
