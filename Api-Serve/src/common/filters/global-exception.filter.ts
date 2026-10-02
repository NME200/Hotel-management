import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityNotFoundError, QueryFailedError } from 'typeorm';
import { ApiResponse } from '../models/api-response';
import { REQUEST_ID_METADATA } from '../interceptors/response-envelope.interceptor';

interface ErrorPayload {
  code: number;
  message: string;
  errors?: string[];
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest();
    const reply = http.getResponse();
    const requestId: string = request?.[REQUEST_ID_METADATA] ?? randomUUID();
    const payload = this.resolvePayload(exception);

    if (payload.code >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method ?? '-'} ${request.url ?? '-'} -> ${payload.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `${request.method ?? '-'} ${request.url ?? '-'} -> ${payload.code} ${payload.message}`,
      );
    }

    const body: ApiResponse<null> = {
      code: payload.code,
      message: payload.message,
      data: null,
      timestamp: Date.now(),
      requestId,
      ...(payload.errors ? { errors: payload.errors } : {}),
    };

    reply.status(payload.code).json(body);
  }

  private resolvePayload(exception: unknown): ErrorPayload {
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    if (exception instanceof EntityNotFoundError) {
      return { code: HttpStatus.NOT_FOUND, message: '资源不存在' };
    }

    if (exception instanceof QueryFailedError) {
      return this.fromQueryFailure(exception);
    }

    return {
      code: HttpStatus.INTERNAL_SERVER_ERROR,
      message: '服务器内部错误',
    };
  }

  private fromHttpException(exception: HttpException): ErrorPayload {
    const code = exception.getStatus();
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return { code, message: response };
    }

    const record = response as Record<string, unknown>;
    const rawMessage = record?.message;
    const errors = Array.isArray(rawMessage)
      ? rawMessage.map((item) => String(item))
      : undefined;

    return {
      code,
      message:
        typeof rawMessage === 'string'
          ? rawMessage
          : errors?.join('；') ?? exception.message,
      ...(errors ? { errors } : {}),
    };
  }

  /**
   * 唯一约束/外键冲突转换为可读提示，业务代码因此无需关心数据库错误码。
   */
  private fromQueryFailure(exception: QueryFailedError): ErrorPayload {
    const driverError = (exception as QueryFailedError & { driverError?: { code?: string } })
      .driverError;
    const code = driverError?.code ?? '';

    if (code === 'ER_DUP_ENTRY') {
      return { code: HttpStatus.CONFLICT, message: '数据已存在，请检查唯一字段' };
    }
    if (code === 'ER_ROW_IS_REFERENCED_2' || code === 'ER_NO_REFERENCED_ROW_2') {
      return {
        code: HttpStatus.CONFLICT,
        message: '该数据已被其他记录引用，无法删除或变更',
      };
    }
    return {
      code: HttpStatus.INTERNAL_SERVER_ERROR,
      message: '数据库操作失败',
    };
  }
}
