import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { CacheKey } from '../../common/constants/cache-key';
import { BusinessException } from '../../common/exceptions/business.exception';
import type {
  JwtAccessTokenPayload,
  JwtRefreshTokenPayload,
} from '../../common/models/auth-context';
import type { ConfigRoot } from '../../config/configuration';
import { RedisService } from '../redis/redis.service';
import type { AuthResult, AuthUserProfile } from './models/auth-result.model';

interface RefreshSession {
  sub: number;
  userType: JwtRefreshTokenPayload['userType'];
}

@Injectable()
export class TokenService {
  static readonly REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

  constructor(
    private readonly jwtService: JwtService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService<ConfigRoot, true>,
  ) {}

  get accessTtlSeconds(): number {
    return (
      this.configService.get('app', { infer: true }).jwt.accessExpiresInMinutes * 60
    );
  }

  async issue(profile: AuthUserProfile): Promise<AuthResult> {
    return this.issueWithSession(profile, randomUUID());
  }

  /**
   * refresh 时沿用同一 sessionId，登出即可一次性作废该会话，
   * 同时保证 Redis 中只保留一条会话记录。
   */
  async issueWithSession(
    profile: AuthUserProfile,
    sessionId: string,
  ): Promise<AuthResult> {
    const accessPayload: JwtAccessTokenPayload = {
      sub: profile.id,
      userType: profile.userType,
      merchantId: profile.merchantId,
      merchantName: profile.merchantName,
      role: profile.role,
      username: profile.username,
      realName: profile.realName,
      sessionId,
    };
    const refreshPayload: JwtRefreshTokenPayload = {
      sub: profile.id,
      userType: profile.userType,
      sessionId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, { expiresIn: this.accessTtlSeconds }),
      this.jwtService.signAsync(refreshPayload, {
        expiresIn: TokenService.REFRESH_TOKEN_TTL_SECONDS,
      }),
    ]);

    const session: RefreshSession = { sub: profile.id, userType: profile.userType };
    await this.redis.setJson(
      CacheKey.refreshToken(sessionId),
      session,
      TokenService.REFRESH_TOKEN_TTL_SECONDS,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTtlSeconds,
      user: profile,
    };
  }

  async readSession(refreshToken: string): Promise<{ sessionId: string; sub: number; userType: RefreshSession['userType'] }> {
    let payload: JwtRefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtRefreshTokenPayload>(refreshToken);
    } catch {
      throw new BusinessException('refreshToken 无效或已过期', HttpStatus.UNAUTHORIZED);
    }

    const key = CacheKey.refreshToken(payload.sessionId);
    const session = await this.redis.getJson<RefreshSession>(key);
    if (!session || session.sub !== payload.sub) {
      throw new BusinessException('会话已失效，请重新登录', HttpStatus.UNAUTHORIZED);
    }

    return { sessionId: payload.sessionId, sub: payload.sub, userType: payload.userType };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.redis.del(CacheKey.refreshToken(sessionId));
  }

  /**
   * 滑动刷新后的会话信息，用于 access token 校验时确认会话未被登出。
   */
  async isSessionAlive(sessionId: string): Promise<boolean> {
    return (await this.redis.getJson<RefreshSession>(CacheKey.refreshToken(sessionId))) !== null;
  }
}
