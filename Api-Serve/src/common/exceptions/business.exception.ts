import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 业务异常：HTTP 状态码沿用语义化状态，code 与 message 直接给到前端。
 */
export class BusinessException extends HttpException {
  constructor(
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly errors?: string[],
  ) {
    super({ code: status, message, errors }, status);
  }

  static badRequest(message: string, errors?: string[]): BusinessException {
    return new BusinessException(message, HttpStatus.BAD_REQUEST, errors);
  }

  static notFound(message = '资源不存在'): BusinessException {
    return new BusinessException(message, HttpStatus.NOT_FOUND);
  }

  static conflict(message: string): BusinessException {
    return new BusinessException(message, HttpStatus.CONFLICT);
  }

  static forbidden(message = '无操作权限'): BusinessException {
    return new BusinessException(message, HttpStatus.FORBIDDEN);
  }
}
