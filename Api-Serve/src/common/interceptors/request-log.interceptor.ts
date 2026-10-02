import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const request = context.switchToHttp().getRequest();
    const method: string = request.method;
    const url: string = request.originalUrl ?? request.url;

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(`${method} ${url} ${Date.now() - startedAt}ms`);
        },
        error: () => {
          this.logger.warn(`${method} ${url} ${Date.now() - startedAt}ms 异常`);
        },
      }),
    );
  }
}
