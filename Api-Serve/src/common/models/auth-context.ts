import { UserType } from '../constants/dict';

/** 登录态在 request.user 上的结构，由 JWT 策略写入。 */
export interface AuthUser {
  id: number;
  username: string;
  realName: string;
  userType: UserType;
  /** 平台账号为 null，商户账号为所属商户 ID */
  merchantId: number | null;
  merchantName: string | null;
  role: string;
  permissions: string[];
  /** refresh token 会话标识，用于登出时精确作废 */
  sessionId: string;
}

export interface JwtAccessTokenPayload {
  sub: number;
  userType: UserType;
  merchantId: number | null;
  merchantName: string | null;
  role: string;
  username: string;
  realName: string;
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface JwtRefreshTokenPayload {
  sub: number;
  userType: UserType;
  sessionId: string;
  iat?: number;
  exp?: number;
}
