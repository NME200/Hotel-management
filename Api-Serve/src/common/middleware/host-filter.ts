import { BadRequestException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * 校验 Host 头，防止 Host Header 攻击（DESIGN.md 中的 ALLOWED_HOSTS）。
 */
export function createHostFilter(allowedHosts: readonly string[]) {
  const allowed = new Set(allowedHosts.map((host) => host.toLowerCase()));

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (allowed.size === 0) {
      next();
      return;
    }
    const raw = req.headers.host ?? '';
    const hostname = raw.toLowerCase().replace(/:\d+$/, '');
    if (!allowed.has(hostname)) {
      throw new BadRequestException(`不被允许的 Host: ${hostname || '-'}`);
    }
    next();
  };
}
