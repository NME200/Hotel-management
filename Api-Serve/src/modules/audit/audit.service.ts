import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  Like,
  MoreThanOrEqual,
  LessThanOrEqual,
  Repository,
  type FindOptionsWhere,
} from 'typeorm';
import { AUDIT_ACTION_LABELS, auditActionLabel } from './constants/audit-action';
import { PlatformAudit } from '../../database/entities/platform-audit.entity';
import type { AuditActor } from '../../common/models/audit-context';
import { buildPageResult, type PageResult } from '../../common/dto/page-result.dto';
import { toSkipTake } from '../../common/dto/page-query.dto';
import { endOfDay, startOfDay } from '../../common/utils/date.util';
import type { AuditQueryDto } from './dto/audit-query.dto';
import type { AuditEntry, AuditItem } from './models/audit.model';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(PlatformAudit)
    private readonly audits: Repository<PlatformAudit>,
  ) {}

  /** 审计写入失败只告警不抛出：不能因为记录失败让业务操作回滚或报错。 */
  async record(actor: AuditActor, entry: AuditEntry): Promise<void> {
    try {
      const audit = this.audits.create({
        operatorId: actor.operatorId,
        operatorName: actor.operatorName,
        operatorType: actor.operatorType,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        targetName: entry.targetName ?? null,
        detail: entry.detail ?? null,
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
      await this.audits.save(audit);
    } catch (error) {
      this.logger.warn(
        `审计记录写入失败 action=${entry.action}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async page(query: AuditQueryDto): Promise<PageResult<AuditItem>> {
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const [rows, total] = await this.audits.findAndCount({
      where: this.buildWhere(query),
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

  /** 前端操作类型下拉的候选值，与落库的机器码同源。 */
  actions(): { value: string; label: string }[] {
    return Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({ value, label }));
  }

  private buildWhere(query: AuditQueryDto): FindOptionsWhere<PlatformAudit> | FindOptionsWhere<PlatformAudit>[] {
    const base: FindOptionsWhere<PlatformAudit> = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.operatorId ? { operatorId: query.operatorId } : {}),
      ...this.dateRange(query),
    };

    const keyword = query.keyword?.trim();
    if (!keyword) {
      return base;
    }

    const pattern = Like(`%${keyword.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
    return [
      { ...base, operatorName: pattern },
      { ...base, targetName: pattern },
      { ...base, action: pattern },
      { ...base, ip: pattern },
    ];
  }

  private dateRange(query: AuditQueryDto): FindOptionsWhere<PlatformAudit> {
    if (query.from && query.to) {
      return { createdAt: Between(startOfDay(query.from), endOfDay(query.to)) };
    }
    if (query.from) {
      return { createdAt: MoreThanOrEqual(startOfDay(query.from)) };
    }
    if (query.to) {
      return { createdAt: LessThanOrEqual(endOfDay(query.to)) };
    }
    return {};
  }

  private toItem(audit: PlatformAudit): AuditItem {
    return {
      id: audit.id,
      operatorId: audit.operatorId,
      operatorName: audit.operatorName,
      operatorType: audit.operatorType,
      action: audit.action,
      actionLabel: auditActionLabel(audit.action),
      targetType: audit.targetType,
      targetId: audit.targetId,
      targetName: audit.targetName,
      detail: audit.detail,
      ip: audit.ip,
      userAgent: audit.userAgent,
      createdAt: audit.createdAt,
    };
  }
}
