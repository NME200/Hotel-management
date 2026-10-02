import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic !== true) {
      return (await super.canActivate(context)) as boolean;
    }

    // 公开接口也尽力解析一次令牌：不是为了让它变成受保护接口，
    // 而是让「同一个地址在登录后能给出个性化结果」成为可能
    // （例如领券中心要告诉已登录顾客这张券他领完了没有）。
    // 解析失败一律忽略，匿名访问仍然是允许的。
    try {
      await super.canActivate(context);
    } catch {
      /* 公开接口：没带令牌或令牌失效都不影响访问 */
    }
    return true;
  }
}
