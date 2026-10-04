import type { ExecutionContext } from '@nestjs/common';

/**
 * 登录 / 换令牌这类凭据入口，是被撞库和暴力破解的首要目标。
 *
 * 中间允许出现角色段（`merchant` / `platform` / `cashier` ...）：
 * 早先只写了 `/auth/(login|refresh)$`，结果 `/auth/merchant/login`、
 * `/auth/platform/login` 这两个真正在用的登录入口**根本没被严格限流覆盖**。
 * 用 `(?:[a-z-]+\/)*` 之后，再新增「某端专属登录」也不会漏。
 */
const AUTH_PATH_PATTERN =
  /\/(?:auth|client\/auth)\/(?:[a-z-]+\/)*login$|\/(?:auth|client\/auth)\/(?:[a-z-]+\/)*refresh$/;

/**
 * 取请求路径（去掉查询串）。
 *
 * 全局前缀 `/api/v1` 是在路由层加上的，这里刻意用后缀匹配而不是全等，
 * 免得以后改前缀时忘了同步改限流判断。
 */
function requestPath(context: ExecutionContext): string {
  const request = context.switchToHttp().getRequest<{ path?: string; url?: string }>();
  const raw = request.path ?? request.url ?? '';
  const queryIndex = raw.indexOf('?');
  return queryIndex === -1 ? raw : raw.slice(0, queryIndex);
}

/** 是否属于「凭据入口」：命中则叠加更严的 auth 限流 */
export function isAuthRequest(context: ExecutionContext): boolean {
  return AUTH_PATH_PATTERN.test(requestPath(context));
}
