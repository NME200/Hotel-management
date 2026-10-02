import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { resolvePermissions } from '../../../common/constants/permission';
import type { AuthUser, JwtAccessTokenPayload } from '../../../common/models/auth-context';
import type { ConfigRoot } from '../../../config/configuration';
import { TokenService } from '../token.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService<ConfigRoot, true>,
    private readonly tokenService: TokenService,
  ) {
    const jwt = configService.get('app', { infer: true }).jwt;
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwt.secret,
      algorithms: [jwt.algorithm],
    });
  }

  async validate(payload: JwtAccessTokenPayload): Promise<AuthUser> {
    if (!(await this.tokenService.isSessionAlive(payload.sessionId))) {
      throw new UnauthorizedException('会话已失效，请重新登录');
    }

    return {
      id: payload.sub,
      username: payload.username,
      realName: payload.realName,
      userType: payload.userType,
      merchantId: payload.merchantId,
      merchantName: payload.merchantName,
      role: payload.role,
      permissions: [...resolvePermissions(payload.userType, payload.role)],
      sessionId: payload.sessionId,
    };
  }
}
