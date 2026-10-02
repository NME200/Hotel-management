import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

const TRUE_FALSE = ['True', 'False', 'true', 'false'] as const;

export type JwtHmacAlgorithm = 'HS256' | 'HS384' | 'HS512';

export class EnvVariables {
  @IsIn(['development', 'production'])
  APP_ENV!: 'development' | 'production';

  @IsIn(TRUE_FALSE)
  DEBUG!: string;

  @IsInt()
  @Min(1)
  APP_PORT!: number;

  @IsString()
  @MinLength(1)
  ALLOWED_ORIGINS!: string;

  @IsString()
  @MinLength(1)
  ALLOWED_HOSTS!: string;

  @IsString()
  DB_HOST!: string;

  @IsInt()
  @Min(1)
  DB_PORT!: number;

  @IsString()
  DB_USER!: string;

  @IsString()
  DB_PASSWORD!: string;

  @IsString()
  DB_NAME!: string;

  @IsInt()
  @Min(1)
  DB_POOL_SIZE!: number;

  @IsString()
  REDIS_HOST!: string;

  @IsInt()
  @Min(1)
  REDIS_PORT!: number;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @IsInt()
  @Min(0)
  REDIS_DB!: number;

  @IsString()
  @MinLength(16)
  JWT_SECRET_KEY!: string;

  @IsIn(['HS256', 'HS384', 'HS512'])
  JWT_ALGORITHM!: JwtHmacAlgorithm;

  @IsInt()
  @Min(1)
  ACCESS_TOKEN_EXPIRE_MINUTES!: number;

  @IsOptional()
  @IsString()
  PRODUCTION_DOMAIN?: string;

  @IsOptional()
  @IsString()
  PROD_DB_HOST?: string;

  @IsOptional()
  @IsString()
  PROD_DB_PASSWORD?: string;

  @IsOptional()
  @IsString()
  PROD_REDIS_HOST?: string;

  // ---------- 支付渠道：全部可选，缺配置即该渠道不可用，不影响启动 ----------

  @IsOptional()
  @IsString()
  WECHAT_PAY_SP_APPID?: string;

  @IsOptional()
  @IsString()
  WECHAT_PAY_SP_MCHID?: string;

  @IsOptional()
  @IsString()
  WECHAT_PAY_API_V3_KEY?: string;

  @IsOptional()
  @IsString()
  WECHAT_PAY_MCH_CERT_SERIAL_NO?: string;

  @IsOptional()
  @IsString()
  WECHAT_PAY_MCH_PRIVATE_KEY_PATH?: string;

  @IsOptional()
  @IsString()
  WECHAT_PAY_PUBLIC_KEY_ID?: string;

  @IsOptional()
  @IsString()
  WECHAT_PAY_PUBLIC_KEY_PATH?: string;

  @IsOptional()
  @IsString()
  WECHAT_PAY_NOTIFY_URL?: string;

  @IsOptional()
  @IsString()
  ALIPAY_APP_ID?: string;

  @IsOptional()
  @IsString()
  ALIPAY_PRIVATE_KEY?: string;

  @IsOptional()
  @IsString()
  ALIPAY_PUBLIC_KEY?: string;

  @IsOptional()
  @IsIn(['True', 'False', 'true', 'false'])
  ALIPAY_SANDBOX?: string;

  @IsOptional()
  @IsString()
  ALIPAY_NOTIFY_URL?: string;

  @IsOptional()
  @IsIn(TRUE_FALSE)
  MOCK_PAY_ENABLED?: string;

  /** 支付等敏感配置入库时的 AES-256-GCM 主密钥（32 字节），必须留在 env */
  @IsOptional()
  @IsString()
  CONFIG_ENCRYPTION_KEY?: string;

  // ---------- 顾客小程序：平台后台「小程序配置」为优先来源，这里只是兜底 ----------

  @IsOptional()
  @IsString()
  MINI_APP_ID?: string;

  @IsOptional()
  @IsString()
  MINI_APP_SECRET?: string;
}
