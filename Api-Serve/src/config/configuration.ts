import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EnvVariables, type JwtHmacAlgorithm } from './env.validation';

function parseBoolean(value: string): boolean {
  return value.trim().toLowerCase() === 'true';
}

function toEnvVariables(source: NodeJS.ProcessEnv): EnvVariables {
  const instance = plainToInstance(EnvVariables, source, {
    enableImplicitConversion: true,
    exposeUnsetFields: false,
  });
  const errors = validateSync(instance, {
    skipMissingProperties: false,
    whitelist: false,
  });
  if (errors.length > 0) {
    const detail = errors
      .map((error) => `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`)
      .join(' | ');
    throw new Error(`环境变量校验失败 -> ${detail}`);
  }
  return instance;
}

export interface DatabaseSettings {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  poolSize: number;
}

export interface RedisSettings {
  host: string;
  port: number;
  password?: string;
  db: number;
}

export interface JwtSettings {
  secret: string;
  algorithm: JwtHmacAlgorithm;
  accessExpiresInMinutes: number;
}

export type AppConfig = {
  env: 'development' | 'production';
  isProduction: boolean;
  debug: boolean;
  port: number;
  allowedOrigins: string[];
  allowedHosts: string[];
  database: DatabaseSettings;
  redis: RedisSettings;
  jwt: JwtSettings;
  payment: PaymentSettings;
  miniProgram: MiniProgramSettings;
};

export interface MiniProgramSettings {
  /** code2session 凭据的 env 兜底值；平台后台保存后以数据库为准 */
  appId: string;
  appSecret: string;
}

export interface PaymentSettings {
  wechat: {
    /** 服务商 AppID */
    spAppid: string;
    /** 服务商商户号 */
    spMchid: string;
    apiV3Key: string;
    mchCertificateSerialNumber: string;
    mchPrivateKeyPath: string;
    /** 微信支付公钥模式（新商户号不再下发平台证书） */
    publicKeyId: string;
    publicKeyPath: string;
    notifyUrl: string;
    enabled: boolean;
  };
  alipay: {
    appId: string;
    privateKey: string;
    alipayPublicKey: string;
    sandbox: boolean;
    notifyUrl: string;
    enabled: boolean;
  };
  mock: { enabled: boolean };
  /** 敏感配置入库的加密主密钥；未配置时后台保存密钥会被拒绝（env 兜底读取不受影响） */
  configEncryptionKey: string | null;
}

/**
 * APP_ENV=production 时，DESIGN.md 第 5 节的 PROD_* 配置覆盖开发配置。
 */
export function buildConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const env = toEnvVariables(source);
  const isProduction = env.APP_ENV === 'production';

  return {
    env: env.APP_ENV,
    isProduction,
    debug: !isProduction && parseBoolean(env.DEBUG),
    port: env.APP_PORT,
    allowedOrigins: splitList(env.ALLOWED_ORIGINS),
    allowedHosts: splitList(env.ALLOWED_HOSTS),
    database: {
      host: isProduction ? readRequired(source, 'PROD_DB_HOST') : env.DB_HOST,
      port: env.DB_PORT,
      username: env.DB_USER,
      password: isProduction ? readRequired(source, 'PROD_DB_PASSWORD') : env.DB_PASSWORD,
      database: env.DB_NAME,
      poolSize: env.DB_POOL_SIZE,
    },
    redis: {
      host: isProduction ? readRequired(source, 'PROD_REDIS_HOST') : env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD?.length ? env.REDIS_PASSWORD : undefined,
      db: env.REDIS_DB,
    },
    jwt: {
      secret: env.JWT_SECRET_KEY,
      algorithm: env.JWT_ALGORITHM,
      accessExpiresInMinutes: env.ACCESS_TOKEN_EXPIRE_MINUTES,
    },
    payment: {
      wechat: {
        spAppid: env.WECHAT_PAY_SP_APPID ?? '',
        spMchid: env.WECHAT_PAY_SP_MCHID ?? '',
        apiV3Key: env.WECHAT_PAY_API_V3_KEY ?? '',
        mchCertificateSerialNumber: env.WECHAT_PAY_MCH_CERT_SERIAL_NO ?? '',
        mchPrivateKeyPath: env.WECHAT_PAY_MCH_PRIVATE_KEY_PATH ?? '',
        publicKeyId: env.WECHAT_PAY_PUBLIC_KEY_ID ?? '',
        publicKeyPath: env.WECHAT_PAY_PUBLIC_KEY_PATH ?? '',
        notifyUrl: env.WECHAT_PAY_NOTIFY_URL ?? '',
        // 服务商身份与密钥齐备才认为可用，否则下单直接拒绝而不是半途报错
        enabled: Boolean(
          env.WECHAT_PAY_SP_APPID &&
            env.WECHAT_PAY_SP_MCHID &&
            env.WECHAT_PAY_API_V3_KEY &&
            env.WECHAT_PAY_MCH_PRIVATE_KEY_PATH &&
            env.WECHAT_PAY_NOTIFY_URL,
        ),
      },
      alipay: {
        appId: env.ALIPAY_APP_ID ?? '',
        privateKey: env.ALIPAY_PRIVATE_KEY ?? '',
        alipayPublicKey: env.ALIPAY_PUBLIC_KEY ?? '',
        sandbox: parseBoolean(env.ALIPAY_SANDBOX ?? 'False'),
        notifyUrl: env.ALIPAY_NOTIFY_URL ?? '',
        enabled: Boolean(
          env.ALIPAY_APP_ID && env.ALIPAY_PRIVATE_KEY && env.ALIPAY_PUBLIC_KEY && env.ALIPAY_NOTIFY_URL,
        ),
      },
      mock: {
        enabled: !isProduction && parseBoolean(env.MOCK_PAY_ENABLED ?? 'True'),
      },
      configEncryptionKey: env.CONFIG_ENCRYPTION_KEY?.trim() || null,
    },
    miniProgram: {
      appId: env.MINI_APP_ID ?? '',
      appSecret: env.MINI_APP_SECRET ?? '',
    },
  };
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function readRequired(source: NodeJS.ProcessEnv, key: string): string {
  const value = source[key];
  if (!value) {
    throw new Error(`生产环境缺少必需的配置项 ${key}`);
  }
  return value;
}

/** ConfigService 的根类型，业务代码统一用 configService.get('app')。 */
export type ConfigRoot = { app: AppConfig };

export const configuration = (): ConfigRoot => ({ app: buildConfig() });
