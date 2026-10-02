import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, type FindOptionsWhere, type Repository } from 'typeorm';
import type { PageResult } from '../../../common/dto/page-result.dto';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { likePattern } from '../../../common/utils/like.util';
import { Member } from '../../../database/entities/member.entity';
import type { MemberQueryDto, UpdateMemberDto } from './dto/member.dto';

@Injectable()
export class MemberService {
  private readonly members: TenantRepo<Member>;

  constructor(@InjectRepository(Member) repository: Repository<Member>) {
    this.members = new TenantRepo(repository);
  }

  async page(merchantId: number, query: MemberQueryDto): Promise<PageResult<Member>> {
    const base: FindOptionsWhere<Member> = {
      ...(query.level ? { level: query.level } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const keyword = query.keyword?.trim();
    const where: FindOptionsWhere<Member> | FindOptionsWhere<Member>[] = keyword
      ? [
          { ...base, nickname: Like(likePattern(keyword)) },
          { ...base, phone: Like(likePattern(keyword)) },
        ]
      : base;

    return this.members.page(merchantId, query, { where, order: { id: 'DESC' } });
  }

  async detail(merchantId: number, id: number): Promise<Member> {
    return this.members.findById(merchantId, id);
  }

  async update(merchantId: number, id: number, dto: UpdateMemberDto): Promise<Member> {
    return this.members.update(merchantId, id, dto);
  }
}
