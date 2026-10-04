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

  /** 信任的反向代理跳数；留空则生产默认 1、开发默认 0 */
  @IsOptional()
  @IsString()
  TRUST_PROXY?: string;

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

  // ---------- 图片上传：缺配置就用默认值，不影响启动 ----------

  @IsOptional()
  @IsString()
  UPLOAD_DIR?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  UPLOAD_MAX_MB?: number;

  /** local（默认）或 s3；s3 的必填项在 configuration 里统一校验 */
  @IsOptional()
  @IsIn(['local', 's3', 'LOCAL', 'S3'])
  UPLOAD_DRIVER?: string;

  @IsOptional()
  @IsString()
  S3_BUCKET?: string;

  @IsOptional()
  @IsString()
  S3_REGION?: string;

  @IsOptional()
  @IsString()
  S3_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  S3_ACCESS_KEY_ID?: string;

  @IsOptional()
  @IsString()
  S3_SECRET_ACCESS_KEY?: string;

  @IsOptional()
  @IsIn(TRUE_FALSE)
  S3_FORCE_PATH_STYLE?: string;

  @IsOptional()
  @IsString()
  S3_PUBLIC_BASE_URL?: string;

  // ---------- 接口限流：缺配置用默认值，不影响启动 ----------

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_TTL_MS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  THROTTLE_LOGIN_LIMIT?: number;

  // ---------- 顾客小程序：平台后台「小程序配置」为优先来源，这里只是兜底 ----------

  @IsOptional()
  @IsString()
  MINI_APP_ID?: string;

  @IsOptional()
  @IsString()
  MINI_APP_SECRET?: string;

  /** 生成桌位小程序码时的小程序版本：release | trial | develop，默认 release */
  @IsOptional()
  @IsString()
  MINI_ENV_VERSION?: string;

  /** 桌位码扫码后落地的小程序页面，默认 pages/index/index */
  @IsOptional()
  @IsString()
  MINI_QR_PAGE?: string;

  // ---------- 云打印机厂商：与支付渠道同理，全部可选，缺配置即该厂商不可用 ----------

  // ---------- 短信验证码：全可选；不配就只能用手机号一键授权那条路登录 ----------

  @IsOptional()
  @IsIn(['log', 'aliyun', 'tencent', 'custom'])
  SMS_DRIVER?: string;

  @IsOptional()
  @IsString()
  SMS_ALIYUN_ACCESS_KEY_ID?: string;

  @IsOptional()
  @IsString()
  SMS_ALIYUN_ACCESS_KEY_SECRET?: string;

  @IsOptional()
  @IsString()
  SMS_TENCENT_SECRET_ID?: string;

  @IsOptional()
  @IsString()
  SMS_TENCENT_SECRET_KEY?: string;

  @IsOptional()
  @IsString()
  SMS_TENCENT_SDK_APP_ID?: string;

  @IsOptional()
  @IsString()
  SMS_CUSTOM_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  SMS_CUSTOM_AUTH_HEADER?: string;

  @IsOptional()
  @IsString()
  SMS_CUSTOM_BODY_TEMPLATE?: string;

  @IsOptional()
  @IsString()
  SMS_CUSTOM_TOKEN?: string;

  @IsOptional()
  @IsString()
  SMS_SIGN_NAME?: string;

  @IsOptional()
  @IsString()
  SMS_TEMPLATE_CODE?: string;

  @IsOptional()
  @IsString()
  SMS_REGION?: string;

  @IsOptional()
  @IsString()
  SMS_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  FEIE_UID?: string;

  @IsOptional()
  @IsString()
  FEIE_API_KEY?: string;

  @IsOptional()
  @IsString()
  FEIE_BASE_URL?: string;

  @IsOptional()
  @IsString()
  YILIANYUN_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  YILIANYUN_CLIENT_SECRET?: string;

  @IsOptional()
  @IsString()
  YILIANYUN_BASE_URL?: string;
}
