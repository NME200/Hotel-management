import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheKey, CacheTtl } from '../../common/constants/cache-key';
import { BusinessException } from '../../common/exceptions/business.exception';
import {
  decryptSecret,
  encryptSecret,
  fingerprint,
  isEncrypted,
  parseEncryptionKey,
  SECRET_MASK,
} from '../../common/utils/crypto.util';
import type { ConfigRoot, SmsSettings } from '../../config/configuration';
import { SmsConfig } from '../../database/entities/sms-config.entity';
import { RedisService } from '../redis/redis.service';
import {
  SMS_CUSTOM_DEFAULT_AUTH_HEADER,
  SMS_DRIVER_DEFAULTS,
  SMS_DRIVER_FIELDS,
  SMS_DRIVER_LABELS,
  SMS_DRIVER_REQUIRED_FIELDS,
  SMS_DRIVER_SECRET_FIELDS,
  SMS_DRIVERS,
  SmsDriver,
  type SmsConfigField,
  type SmsSecretName,
  parseCustomAuthHeader,
  smsFieldLabel,
  validateCustomBodyTemplate,
  validateCustomEndpoint,
} from './constants/sms-driver.constant';
import type { UpdateSmsConfigDto } from './dto/sms-config.dto';
import type {
  EffectiveSmsConfig,
  SmsConfigItem,
  SmsDriverMeta,
} from './models/sms-config.model';
import type { PrintSecretFieldView } from '../print-provider/models/print-provider.model';
import type { SmsProvider } from './sms-provider.interface';
import { SmsProviderRegistry } from './sms-provider.registry';

type SecretField = 'accessKeySecret' | 'customToken';

const GLOBAL_SLOT = 'global';

/**
 * 短信配置的落库与生效层。
 *
 * 三条规则与支付渠道、云打印机厂商配置完全一致，因为要解决的是同一个问题：
 * 1. 密钥密文入库，主密钥只在 `.env`；接口只回掩码 + 指纹；
 * 2. 提交回来等于掩码的值一律视为「不修改」，空串才是清除；
 * 3. 数据库没配时回落 `.env`，保证首次部署不会因为表里空数据而发不出验证码。
 *
 * 两条本地特有的：
 * - `log` 通道在生产环境直接判为不可用。它把验证码写进日志，
 *   生产开着等于把登录凭据抄送给整套日志采集系统。
 * - 通道的必填项、字段措辞、官方兜底值全部按通道取（见 `sms-driver.constant.ts`），
 *   界面与提示都读这一份，避免出现「界面说缺 A、后端说缺 B」。
 */
@Injectable()
export class SmsConfigService {
  private readonly logger = new Logger(SmsConfigService.name);
  private encryptionKey: Buffer | null = null;

  constructor(
    @InjectRepository(SmsConfig) private readonly configs: Repository<SmsConfig>,
    private readonly configService: ConfigService<ConfigRoot, true>,
    private readonly redis: RedisService,
    private readonly registry: SmsProviderRegistry,
  ) {}

  /* ======================= 平台端 ======================= */

  async get(): Promise<SmsConfigItem> {
    const row = await this.readRow();
    const effective = await this.getEffective();

    return {
      enabled: effective.enabled,
      configured: effective.configured,
      missingFields: effective.missingFields,
      source: effective.source,
      driver: effective.driver,
      driverOverride: (row?.driver as SmsDriver | null) ?? null,
      logAllowed: !this.isProduction(),
      drivers: this.driverMetas(row),
      accessKeyId: row?.accessKeyId ?? (effective.accessKeyId || null),
      sdkAppId: row?.sdkAppId ?? (effective.sdkAppId || null),
      signName: row?.signName ?? (effective.signName || null),
      templateCode: row?.templateCode ?? (effective.templateCode || null),
      region: effective.region,
      endpoint: effective.endpoint,
      overrides: {
        region: row?.region ?? null,
        endpoint: row?.endpoint ?? null,
        customAuthHeader: row?.customAuthHeader ?? null,
        customBodyTemplate: row?.customBodyTemplate ?? null,
      },
      updatedAt: row?.updatedAt ?? null,
      updatedByName: row?.updatedByName ?? null,
    };
  }

  async update(
    dto: UpdateSmsConfigDto,
    operator: { id: number; name: string },
  ): Promise<SmsConfigItem> {
    const row = (await this.readRow()) ?? this.configs.create({ slot: GLOBAL_SLOT });

    if (dto.enabled !== undefined) {
      row.enabled = dto.enabled;
    }
    if (dto.driver !== undefined) {
      row.driver = trimOrNull(dto.driver);
    }
    if (dto.accessKeyId !== undefined) {
      row.accessKeyId = trimOrNull(dto.accessKeyId);
    }
    if (dto.sdkAppId !== undefined) {
      row.sdkAppId = trimOrNull(dto.sdkAppId);
    }
    if (dto.signName !== undefined) {
      row.signName = trimOrNull(dto.signName);
    }
    if (dto.templateCode !== undefined) {
      row.templateCode = trimOrNull(dto.templateCode);
    }
    if (dto.region !== undefined) {
      row.region = trimOrNull(dto.region);
    }
    if (dto.endpoint !== undefined) {
      row.endpoint = trimOrNull(dto.endpoint);
    }
    if (dto.customAuthHeader !== undefined) {
      row.customAuthHeader = trimOrNull(dto.customAuthHeader);
    }
    if (dto.customBodyTemplate !== undefined) {
      row.customBodyTemplate = trimOrNull(dto.customBodyTemplate);
    }

    const target = (row.driver as SmsDriver | null) ?? this.env().driver;
    this.rejectBrokenCustomShape(target, dto);
    for (const field of SMS_DRIVER_SECRET_FIELDS[target]) {
      this.applySecret(row, field, dto.secrets?.[field]);
    }

    // 选了 log 通道又开着总开关，只允许在开发环境发生
    const effective = await this.buildEffective(row);
    if (effective.enabled && !effective.allowed) {
      throw BusinessException.badRequest(effective.disallowReason ?? '当前环境不允许使用该短信通道');
    }

    row.updatedById = operator.id;
    row.updatedByName = operator.name;
    await this.configs.save(row);
    await this.redis.del(CacheKey.smsConfig());

    this.logger.log(
      `短信配置已更新：通道=${effective.driver} 开关=${effective.enabled}（操作人 ${operator.name}）`,
    );
    return this.get();
  }

  /** 自检：读的是已保存的生效配置，不是页面草稿。 */
  async test(): Promise<{ ok: boolean; message: string; checkedAt: Date }> {
    const checkedAt = new Date();
    const effective = await this.getEffective();

    if (!effective.allowed) {
      return { ok: false, message: effective.disallowReason ?? '当前环境不允许该通道', checkedAt };
    }
    const provider = this.registry.require(effective.driver);
    if (!provider.isReady(effective)) {
      return {
        ok: false,
        message: effective.missingFields.length
          ? `缺少必填配置：${effective.missingFields.join('、')}`
          : `${provider.label}的配置不完整，请补全后保存再自检`,
        checkedAt,
      };
    }
    const result = await provider.probe(effective);
    return { ...result, checkedAt };
  }

  /* ======================= 运行时取生效值 ======================= */

  async getEffective(): Promise<EffectiveSmsConfig> {
    const cached = await this.redis.getJson<EffectiveSmsConfig>(CacheKey.smsConfig());
    if (cached) {
      return cached;
    }
    const effective = await this.buildEffective(await this.readRow());
    await this.redis.setJson(CacheKey.smsConfig(), effective, CacheTtl.smsConfig);
    return effective;
  }

  /** 按通道取实现，供 `SmsService` 发送时使用。 */
  providerOf(driver: SmsDriver): SmsProvider {
    return this.registry.require(driver);
  }

  /* ======================= 内部 ======================= */

  private readRow(): Promise<SmsConfig | null> {
    return this.configs.findOne({ where: { slot: GLOBAL_SLOT } });
  }

  private async buildEffective(row: SmsConfig | null): Promise<EffectiveSmsConfig> {
    const driver = (row?.driver as SmsDriver | null) ?? this.env().driver;
    return this.valuesFor(driver, row);
  }

  /** 生效值：通道由调用方给，好让平台端一次算出四个通道各自「配齐了没有」。 */
  private valuesFor(driver: SmsDriver, row: SmsConfig | null): EffectiveSmsConfig {
    const env = this.env();
    const production = this.isProduction();
    const key = this.getEncryptionKey();

    const defaults = SMS_DRIVER_DEFAULTS[driver];
    // `.env` 那一套只描述它自己选中的那一个通道：后台换成别的通道时，
    // 不能把 .env 里给阿里云准备的 SecretId / cn-hangzhou 当成腾讯云的值。
    const fromEnv = driver === env.driver;
    const cloud = fromEnv ? envCloudCredentials(driver, env) : EMPTY_CLOUD_CREDENTIALS;
    const envCustom = fromEnv ? env.custom : EMPTY_CUSTOM;

    const values: EffectiveSmsConfig = {
      driver,
      enabled: row ? Boolean(row.enabled) : this.envConfigured(driver, env),
      accessKeyId: row?.accessKeyId || cloud.accessKeyId,
      accessKeySecret: this.readSecret(row?.accessKeySecretEncrypted, cloud.accessKeySecret, key),
      sdkAppId: row?.sdkAppId || cloud.sdkAppId,
      signName: row?.signName || env.signName,
      templateCode: row?.templateCode || env.templateCode,
      region: row?.region || (fromEnv ? env.region : '') || defaults.region,
      endpoint:
        row?.endpoint ||
        (driver === SmsDriver.Custom
          ? envCustom.endpoint
          : (fromEnv ? env.endpoint : '') || defaults.endpoint),
      customToken: this.readSecret(row?.customTokenEncrypted, envCustom.token, key),
      customAuthHeader: '',
      customBodyTemplate:
        row?.customBodyTemplate || envCustom.bodyTemplate || defaults.bodyTemplate,
      source: row ? 'database' : this.envConfigured(driver, env) ? 'env' : 'none',
      missingFields: [],
      configured: false,
      allowed: !(driver === SmsDriver.Log && production),
      disallowReason:
        driver === SmsDriver.Log && production
          ? '生产环境不允许使用日志通道（验证码会进日志）。请把通道改为阿里云、腾讯云或自定义网关，或关闭短信验证码登录'
          : null,
    };

    // 鉴权头留空：配了密钥就按最常见的 Bearer 形态发，没配密钥就是「这个网关不要鉴权」
    values.customAuthHeader =
      row?.customAuthHeader ||
      envCustom.authHeader ||
      (values.customToken ? SMS_CUSTOM_DEFAULT_AUTH_HEADER : '');

    values.missingFields = SMS_DRIVER_REQUIRED_FIELDS[driver]
      .filter((field) => !String(values[field] ?? '').trim().length)
      .map((field) => smsFieldLabel(driver, field));

    const auth = parseCustomAuthHeader(values.customAuthHeader);
    if (driver === SmsDriver.Custom && auth?.pattern.includes('{token}') && !values.customToken) {
      values.missingFields.push(smsFieldLabel(driver, 'customToken'));
    }

    values.configured = values.missingFields.length === 0 && values.allowed;
    return values;
  }

  private buildSecretFields(driver: SmsDriver, effective: EffectiveSmsConfig): PrintSecretFieldView[] {
    return SMS_DRIVER_SECRET_FIELDS[driver].map((name) => {
      const plain = (name === 'customToken' ? effective.customToken : effective.accessKeySecret) ?? '';
      const configured = plain.trim().length > 0;
      return {
        name,
        label: smsFieldLabel(driver, name),
        configured,
        masked: configured ? SECRET_MASK : '',
        // 指纹算明文而不是密文：密文每次保存都换随机 IV，指纹会变，对不上「改了没有」这个问题
        fingerprint: configured ? fingerprint(plain) : null,
      };
    });
  }

  private driverMetas(row: SmsConfig | null): SmsDriverMeta[] {
    return SMS_DRIVERS.map((driver) => {
      const values = this.valuesFor(driver, row);
      const labels: Record<string, string> = {};
      for (const field of SMS_DRIVER_FIELDS[driver]) {
        labels[field] = smsFieldLabel(driver, field);
      }
      return {
        driver,
        label: SMS_DRIVER_LABELS[driver],
        fields: [...SMS_DRIVER_FIELDS[driver]],
        requiredFields: [...SMS_DRIVER_REQUIRED_FIELDS[driver]],
        labels,
        secretFields: this.buildSecretFields(driver, values),
        defaults: { ...SMS_DRIVER_DEFAULTS[driver] },
      };
    });
  }

  private applySecret(row: SmsConfig, field: SecretField, incoming: string | undefined): void {
    if (incoming === undefined || incoming === SECRET_MASK) {
      return;
    }
    const stored = incoming === '' ? null : encryptSecret(incoming, this.requireEncryptionKey());
    if (field === 'customToken') {
      row.customTokenEncrypted = stored;
    } else {
      row.accessKeySecretEncrypted = stored;
    }
  }

  private readSecret(
    stored: string | null | undefined,
    fallback: string,
    key: Buffer | null,
  ): string {
    if (!stored) {
      return fallback;
    }
    if (!isEncrypted(stored)) {
      return stored;
    }
    if (!key) {
      return '';
    }
    try {
      return decryptSecret(stored, key);
    } catch (error) {
      // 主密钥轮换或数据被手工改过：降级成「未配置」而不是让发码 500
      this.logger.error(
        `解密短信密钥失败，请检查 CONFIG_ENCRYPTION_KEY：${error instanceof Error ? error.message : String(error)}`,
      );
      return '';
    }
  }

  /**
   * 自定义通道的形状校验：只查这一次提交里显式填了的那几项。
   *
   * 半成品（什么都没填）仍然允许保存，运营常常先建壳子再等审核；
   * 但**填错了**的网关地址或请求体模板要当场说，不能等顾客点「获取验证码」才发现。
   */
  private rejectBrokenCustomShape(driver: SmsDriver, dto: UpdateSmsConfigDto): void {
    if (driver !== SmsDriver.Custom) {
      return;
    }
    const fail = (message: string | null): void => {
      if (message) {
        throw BusinessException.badRequest(message);
      }
    };
    if (dto.endpoint !== undefined && dto.endpoint !== null && dto.endpoint.trim()) {
      fail(validateCustomEndpoint(dto.endpoint));
    }
    if (
      dto.customAuthHeader !== undefined &&
      dto.customAuthHeader !== null &&
      dto.customAuthHeader.trim() &&
      !parseCustomAuthHeader(dto.customAuthHeader)
    ) {
      throw BusinessException.badRequest(
        `鉴权头要写成「头名: 头值模板」，头值里的 {token} 会换成密钥。例如 ${SMS_CUSTOM_DEFAULT_AUTH_HEADER}`,
      );
    }
    if (
      dto.customBodyTemplate !== undefined &&
      dto.customBodyTemplate !== null &&
      dto.customBodyTemplate.trim()
    ) {
      fail(validateCustomBodyTemplate(dto.customBodyTemplate));
    }
  }

  /** `.env` 那套兜底值够不够该通道用：决定首次部署时「配好了没有」与开关默认值。 */
  private envConfigured(driver: SmsDriver, env: SmsSettings): boolean {
    const cloud = envCloudCredentials(driver, env);
    const values: Partial<Record<SmsConfigField, string>> = {
      accessKeyId: cloud.accessKeyId,
      accessKeySecret: cloud.accessKeySecret,
      sdkAppId: cloud.sdkAppId,
      signName: env.signName,
      templateCode: env.templateCode,
      endpoint: driver === SmsDriver.Custom ? env.custom.endpoint : env.endpoint,
      customBodyTemplate: env.custom.bodyTemplate || SMS_DRIVER_DEFAULTS[driver].bodyTemplate,
    };
    return SMS_DRIVER_REQUIRED_FIELDS[driver].every(
      (field) => (values[field] ?? '').trim().length > 0,
    );
  }

  private env(): SmsSettings {
    return this.configService.get('app', { infer: true }).sms;
  }

  private isProduction(): boolean {
    return this.configService.get('app', { infer: true }).env === 'production';
  }

  private getEncryptionKey(): Buffer | null {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }
    const raw = this.configService.get('app', { infer: true }).payment.configEncryptionKey;
    if (!raw) {
      return null;
    }
    try {
      this.encryptionKey = parseEncryptionKey(raw);
    } catch (error) {
      // 主密钥格式不对（截断、换错编码）：当成没配，让保存动作报错而不是启动就崩
      this.encryptionKey = null;
      this.logger.error('CONFIG_ENCRYPTION_KEY 无法解析，短信密钥将无法保存');
      void error;
    }
    return this.encryptionKey;
  }

  private requireEncryptionKey(): Buffer {
    const key = this.getEncryptionKey();
    if (!key) {
      throw BusinessException.badRequest(
        '未配置 CONFIG_ENCRYPTION_KEY，无法加密保存短信密钥。请在 .env 中配置 32 字节主密钥后重试',
      );
    }
    return key;
  }
}

/** 云厂商那对凭据在 `.env` 里按通道分组，取当前通道那一组。 */
function envCloudCredentials(
  driver: SmsDriver,
  env: SmsSettings,
): { accessKeyId: string; accessKeySecret: string; sdkAppId: string } {
  if (driver === SmsDriver.Tencent) {
    return {
      accessKeyId: env.tencent.secretId,
      accessKeySecret: env.tencent.secretKey,
      sdkAppId: env.tencent.sdkAppId,
    };
  }
  if (driver === SmsDriver.Aliyun) {
    return {
      accessKeyId: env.aliyun.accessKeyId,
      accessKeySecret: env.aliyun.accessKeySecret,
      sdkAppId: '',
    };
  }
  return EMPTY_CLOUD_CREDENTIALS;
}

const EMPTY_CLOUD_CREDENTIALS = { accessKeyId: '', accessKeySecret: '', sdkAppId: '' };

const EMPTY_CUSTOM = { endpoint: '', authHeader: '', bodyTemplate: '', token: '' };

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
