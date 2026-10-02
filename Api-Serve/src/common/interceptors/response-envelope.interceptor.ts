import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../models/api-response';

export const REQUEST_ID_METADATA = 'requestId';

@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest();
    const reply = context.switchToHttp().getResponse();
    const incomingId: string | undefined = request.headers?.['x-request-id'];
    const requestId =
      typeof incomingId === 'string' && incomingId.length > 0 ? incomingId : randomUUID();

    request[REQUEST_ID_METADATA] = requestId;
    reply.setHeader('x-request-id', requestId);

    return next.handle().pipe(
      map((data) => ({
        code: 0,
        message: 'ok',
        data,
        timestamp: Date.now(),
        requestId,
      })),
    );
  }
}
