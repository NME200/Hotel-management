import type { UserType } from '../../../common/constants/dict';

export interface AuthUserProfile {
  id: number;
  username: string;
  realName: string;
  userType: UserType;
  merchantId: number | null;
  merchantName: string | null;
  role: string;
  permissions: string[];
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  /** access token 有效期，单位秒 */
  expiresIn: number;
  user: AuthUserProfile;
}
