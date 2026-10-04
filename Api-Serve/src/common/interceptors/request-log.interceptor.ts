import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { AuthUser } from '../models/auth-context';
import { REQUEST_ID_METADATA } from './response-envelope.interceptor';

/** 探针被编排器每秒调用，逐条记日志只会淹没真正有用的业务日志 */
const QUIET_PATHS = ['/health', '/health/live', '/health/ready'];

/**
 * 访问日志。
 *
 * 只保留排障真正会用的字段：方法、路径、状态码、耗时、来源 IP、requestId、操作人。
 * requestId 与响应头、错误响应体里的是同一个值，用户报障时拿它就能串起整条链路。
 */
@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const http = context.switchToHttp();
    const request = http.getRequest();
    const reply = http.getResponse();
    const method: string = request.method;
    const path: string = (request.originalUrl ?? request.url ?? '').split('?')[0];

    if (QUIET_PATHS.includes(path)) {
      return next.handle();
    }

    const requestId: string = request[REQUEST_ID_METADATA] ?? '-';
    const ip: string = request.ips?.length ? request.ips[0] : (request.ip ?? '-');
    const user = request.user as AuthUser | undefined;

    const buildLine = (status: number): string => {
      const actor = user
        ? `user=${user.id}${user.merchantId ? ` merchant=${user.merchantId}` : ''}`
        : 'user=anon';
      return `${method} ${path} ${status} ${Date.now() - startedAt}ms ip=${ip} ${actor} rid=${requestId}`;
    };

    return next.handle().pipe(
      tap({
        next: () => this.logger.log(buildLine(reply.statusCode ?? 200)),
        error: (error: unknown) => {
          const status = error instanceof HttpException ? error.getStatus() : 500;
          if (status >= 500) {
            this.logger.error(buildLine(status));
          } else {
            this.logger.warn(buildLine(status));
          }
        },
      }),
    );
  }
}
