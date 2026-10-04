import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SMS_DRIVERS, SmsDriver } from '../modules/sms/constants/sms-driver.constant';
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

/** 图片存储驱动：本地磁盘适合单机，对象存储是多副本部署的必要条件 */
export type UploadDriver = 'local' | 's3';

export interface S3UploadSettings {
  bucket: string;
  region: string;
  /** 兼容 S3 协议的自建网关地址（MinIO / 腾讯云 COS / 阿里云 OSS 等）；留空则走 AWS 默认端点 */
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** 自建网关通常需要路径风格寻址；云厂商对象存储用虚拟主机风格 */
  forcePathStyle: boolean;
  /** 对外可访问前缀，用于拼出写库的绝对地址，如 https://cdn.example.com */
  publicBaseUrl: string;
}

export type UploadSettings = {
  /** 落盘根目录；仅 local 驱动使用，相对路径按进程工作目录解析，即 Api-Serve/uploads */
  dir: string;
  /** 单文件大小上限（MB），超限由上传拦截层直接拒 */
  maxMb: number;
  driver: UploadDriver;
  /** driver=s3 时必定非空，否则启动阶段就报错 */
  s3: S3UploadSettings | null;
};

/**
 * 接口限流参数。
 *
 * 计数落在 Redis 上，多副本共享同一份配额；窗口与上限做成配置是为了
 * 压测/大促时能临时放宽，而不必改代码重新发版。
 */
export interface ThrottleSettings {
  /** 统计窗口（毫秒） */
  ttlMs: number;
  /** 窗口内单个来源的通用请求上限 */
  limit: number;
  /** 登录、换令牌等敏感接口的上限，刻意比通用值严得多 */
  loginLimit: number;
}

export type AppConfig = {
  env: 'development' | 'production';
  isProduction: boolean;
  debug: boolean;
  port: number;
  allowedOrigins: string[];
  allowedHosts: string[];
  /**
   * Express `trust proxy` 取值：交给它信任几层反向代理。
   *
   * 生产部署在 Nginx / 云负载均衡之后，不配这个的话 `req.ip` 永远是代理的地址，
   * 限流会把全站用户算成同一个来源（一超限全员被拦），审计日志里的来源 IP 也全是假的。
   * 数字表示信任的跳数；false 表示直连（本地开发）。
   */
  trustProxy: number | boolean;
  database: DatabaseSettings;
  redis: RedisSettings;
  jwt: JwtSettings;
  payment: PaymentSettings;
  miniProgram: MiniProgramSettings;
  print: PrintSettings;
  sms: SmsSettings;
  upload: UploadSettings;
  throttle: ThrottleSettings;
};

export interface MiniProgramSettings {
  /** code2session 凭据的 env 兜底值；平台后台保存后以数据库为准 */
  appId: string;
  appSecret: string;
  /**
   * 生成小程序码（桌位码）时使用的版本：release=正式版 | trial=体验版 | develop=开发版。
   * 小程序尚未发布时用 release 会拿到 41030（page 不存在），此时改这里即可，不用改代码。
   */
  envVersion: string;
  /**
   * 桌位码扫码后落地的小程序页面（不带前导斜杠）。
   * 该页面 onLoad 会收到 scene 并解析出桌位，默认走首页。
   */
  qrPage: string;
}

/**
 * 短信验证码配置的 `.env` 兜底值。
 *
 * 正式配置在平台后台「系统设置 → 短信配置」，落 `sms_config` 表；
 * 这里只是首次部署还没人在后台录入时的读值来源，数据库有行就以数据库为准。
 * 与支付渠道 / 云打印 / 小程序凭据同一条口径：密钥密文入库、只回掩码 + 指纹。
 */
export interface SmsSettings {
  /** 兜底通道：log=只写日志（仅开发环境允许）| aliyun | tencent | custom */
  driver: SmsDriver;
  /** 短信签名，如「川味小馆」；审核通过后云厂商控制台可见 */
  signName: string;
  /** 验证码模板号：阿里云 SMS_xxx / 腾讯云数字模板 ID */
  templateCode: string;
  /** 留空则按通道取官方默认地域（阿里云 cn-hangzhou / 腾讯云 ap-guangzhou） */
  region: string;
  /** 留空则按通道取官方网关地址 */
  endpoint: string;
  /** 各通道各自的凭据兜底：`SMS_DRIVER` 选谁就读谁那组，避免两组密钥抢同一个字段 */
  aliyun: { accessKeyId: string; accessKeySecret: string };
  tencent: {
    /** 云 API 密钥 SecretId */
    secretId: string;
    secretKey: string;
    /** 短信控制台「应用管理」里的 SdkAppId */
    sdkAppId: string;
  };
  /** 自定义网关：地址必填，鉴权头与请求体模板留空用代码里的默认形状 */
  custom: {
    endpoint: string;
    authHeader: string;
    bodyTemplate: string;
    token: string;
  };
}

/**
 * 云打印机厂商凭据的 env 兜底值。
 *
 * 官方地址写死在代码里而不是配置里：厂商换域名属于代码要跟着改的事，
 * 让运维去改 `.env` 只会让一批部署悄悄指向过期域名。
 * 需要指向沙箱或自建代理时，用平台后台的 `baseUrl` 覆盖。
 */
export interface PrintSettings {
  feie: {
    /** 飞鹅后台登录账号（官方参数名 user） */
    uid: string;
    /** 飞鹅 UKEY */
    apiKey: string;
    baseUrl: string;
    enabled: boolean;
  };
  yilianyun: {
    clientId: string;
    clientSecret: string;
    baseUrl: string;
    enabled: boolean;
  };
}

/** 云打印机厂商官方网关地址 */
export const PRINT_PROVIDER_BASE_URLS = {
  // 飞鹅现行开发者平台的网关（api.feieyun.com 是早年的地址，文档已不写它）
  feie: 'https://api.de.feieyun.com',
  yilianyun: 'https://open-api.10ss.net',
} as const;

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
    trustProxy: resolveTrustProxy(source, isProduction),
    database: {
      host: pick(isProduction, source, 'PROD_DB_HOST', env.DB_HOST),
      port: env.DB_PORT,
      username: env.DB_USER,
      password: pick(isProduction, source, 'PROD_DB_PASSWORD', env.DB_PASSWORD),
      database: env.DB_NAME,
      poolSize: env.DB_POOL_SIZE,
    },
    redis: {
      host: pick(isProduction, source, 'PROD_REDIS_HOST', env.REDIS_HOST),
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
      envVersion: env.MINI_ENV_VERSION?.trim() || 'release',
      qrPage: env.MINI_QR_PAGE?.trim() || 'pages/index/index',
    },
    print: {
      feie: {
        uid: env.FEIE_UID?.trim() ?? '',
        apiKey: env.FEIE_API_KEY?.trim() ?? '',
        baseUrl: env.FEIE_BASE_URL?.trim() || PRINT_PROVIDER_BASE_URLS.feie,
        // uid 与 apikey 成对才可用：只有其一，推单必然被网关拒绝
        enabled: Boolean(env.FEIE_UID?.trim() && env.FEIE_API_KEY?.trim()),
      },
      yilianyun: {
        clientId: env.YILIANYUN_CLIENT_ID?.trim() ?? '',
        clientSecret: env.YILIANYUN_CLIENT_SECRET?.trim() ?? '',
        baseUrl: env.YILIANYUN_BASE_URL?.trim() || PRINT_PROVIDER_BASE_URLS.yilianyun,
        enabled: Boolean(
          env.YILIANYUN_CLIENT_ID?.trim() && env.YILIANYUN_CLIENT_SECRET?.trim(),
        ),
      },
    },
    sms: {
      // 默认 log：没配短信凭据时不该让整个登录页报错，但生产环境会拒绝 log 驱动（见 SmsService）
      driver: resolveSmsDriver(env.SMS_DRIVER),
      signName: env.SMS_SIGN_NAME?.trim() ?? '',
      templateCode: env.SMS_TEMPLATE_CODE?.trim() ?? '',
      // 地域与网关地址不在这里兜官方默认：那是「通道口径」，收在 sms-driver.constant.ts
      region: env.SMS_REGION?.trim() ?? '',
      endpoint: env.SMS_ENDPOINT?.trim() ?? '',
      aliyun: {
        accessKeyId: env.SMS_ALIYUN_ACCESS_KEY_ID?.trim() ?? '',
        accessKeySecret: env.SMS_ALIYUN_ACCESS_KEY_SECRET?.trim() ?? '',
      },
      tencent: {
        secretId: env.SMS_TENCENT_SECRET_ID?.trim() ?? '',
        secretKey: env.SMS_TENCENT_SECRET_KEY?.trim() ?? '',
        sdkAppId: env.SMS_TENCENT_SDK_APP_ID?.trim() ?? '',
      },
      custom: {
        endpoint: env.SMS_CUSTOM_ENDPOINT?.trim() ?? '',
        authHeader: env.SMS_CUSTOM_AUTH_HEADER?.trim() ?? '',
        bodyTemplate: env.SMS_CUSTOM_BODY_TEMPLATE?.trim() ?? '',
        token: env.SMS_CUSTOM_TOKEN?.trim() ?? '',
      },
    },
    upload: {
      dir: env.UPLOAD_DIR?.trim() || 'uploads',
      maxMb: env.UPLOAD_MAX_MB ?? 5,
      driver: resolveUploadDriver(source),
      s3: buildS3Settings(source),
    },
    throttle: {
      ttlMs: env.THROTTLE_TTL_MS ?? 60_000,
      limit: env.THROTTLE_LIMIT ?? 600,
      loginLimit: env.THROTTLE_LOGIN_LIMIT ?? 10,
    },
  };
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * 解析 `TRUST_PROXY`。
 *
 * 未显式配置时：生产默认信任 1 跳（Nginx 或云负载均衡这一层），开发默认不信任。
 * 显式配置成数字则信任对应跳数，配成 'true'/'false' 则整体信任/不信任。
 */
function resolveTrustProxy(source: NodeJS.ProcessEnv, isProduction: boolean): number | boolean {
  const raw = source.TRUST_PROXY?.trim();
  if (!raw) {
    return isProduction ? 1 : false;
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  const hops = Number(raw);
  return Number.isInteger(hops) && hops >= 0 ? hops : isProduction ? 1 : false;
}

/**
 * `.env` 里的通道写错时不报错退出，回落 log。
 *
 * 与 UPLOAD_DRIVER 不同：短信配置写错不该让服务起不来，
 * 开发环境回落 log 照样能跑通登录，生产环境则由 `SmsService` 拒绝发送并给出可执行的提示。
 */
function resolveSmsDriver(raw: string | undefined): SmsDriver {
  const value = raw?.trim();
  return SMS_DRIVERS.includes(value as SmsDriver) ? (value as SmsDriver) : SmsDriver.Log;
}

function resolveUploadDriver(source: NodeJS.ProcessEnv): UploadDriver {
  const raw = source.UPLOAD_DRIVER?.trim().toLowerCase();
  if (!raw || raw === 'local') {
    return 'local';
  }
  if (raw === 's3') {
    return 's3';
  }
  throw new Error(`UPLOAD_DRIVER 只能是 local 或 s3，当前值：${raw}`);
}

/**
 * 选对象存储驱动时把缺项一次性报清楚。
 *
 * 这类配置漏填的表现是「上传接口在运行期偶发 500」，很难定位；
 * 不如在启动阶段直接失败，让部署立刻暴露问题。
 */
function buildS3Settings(source: NodeJS.ProcessEnv): S3UploadSettings | null {
  if (resolveUploadDriver(source) !== 's3') {
    return null;
  }
  const required: Array<[string, string | undefined]> = [
    ['S3_BUCKET', source.S3_BUCKET],
    ['S3_ACCESS_KEY_ID', source.S3_ACCESS_KEY_ID],
    ['S3_SECRET_ACCESS_KEY', source.S3_SECRET_ACCESS_KEY],
    ['S3_PUBLIC_BASE_URL', source.S3_PUBLIC_BASE_URL],
  ];
  const missing = required.filter(([, value]) => !value?.trim()).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`UPLOAD_DRIVER=s3 时缺少必需的配置项：${missing.join(', ')}`);
  }
  return {
    bucket: source.S3_BUCKET!.trim(),
    region: source.S3_REGION?.trim() || 'auto',
    endpoint: source.S3_ENDPOINT?.trim() || '',
    accessKeyId: source.S3_ACCESS_KEY_ID!.trim(),
    secretAccessKey: source.S3_SECRET_ACCESS_KEY!.trim(),
    forcePathStyle: parseBoolean(source.S3_FORCE_PATH_STYLE ?? 'True'),
    publicBaseUrl: source.S3_PUBLIC_BASE_URL!.trim().replace(/\/+$/, ''),
  };
}

/**
 * 生产环境的 `PROD_*` 变量是**可选覆盖**，不是替换。
 *
 * 早先的实现是「生产必须填 PROD_DB_HOST / PROD_DB_PASSWORD」，
 * 于是同一个数据库密码要填两处：`DB_PASSWORD` 被静默忽略、`PROD_DB_PASSWORD` 才生效。
 * 容器化部署时这类「填了没生效」的配置极难排查（连的库不对、密码不对，但启动不报错）。
 *
 * 现在改成：填了 PROD_* 就用它（保持原有生产能力），没填就回退到基础变量。
 * 只设一组 DB_HOST/DB_PASSWORD 也能跑起生产，且已有部署不受影响。
 */
function pick(
  isProduction: boolean,
  source: NodeJS.ProcessEnv,
  prodKey: string,
  fallback: string,
): string {
  if (!isProduction) {
    return fallback;
  }
  return source[prodKey]?.trim() || fallback;
}

/** ConfigService 的根类型，业务代码统一用 configService.get('app')。 */
export type ConfigRoot = { app: AppConfig };

export const configuration = (): ConfigRoot => ({ app: buildConfig() });
