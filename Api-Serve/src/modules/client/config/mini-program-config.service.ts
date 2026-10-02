import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheKey, CacheTtl } from '../../../common/constants/cache-key';
import { BusinessException } from '../../../common/exceptions/business.exception';
import {
  decryptSecret,
  encryptSecret,
  fingerprint,
  isEncrypted,
  looksLikeMask,
  parseEncryptionKey,
  SECRET_MASK,
} from '../../../common/utils/crypto.util';
import { MiniProgramConfig } from '../../../database/entities/mini-program-config.entity';
import { RedisService } from '../../redis/redis.service';
import type { ConfigRoot } from '../../../config/configuration';
import type {
  MiniProgramConfigView,
  UpdateMiniProgramConfigDto,
} from './dto/mini-program-config.dto';

const SLOT = 'global';

/** 生效配置：登录链路只关心「能不能换 openid」，不关心掩码与指纹。 */
export interface EffectiveMiniProgramConfig {
  loginEnabled: boolean;
  appId: string;
  appSecret: string;
  source: 'database' | 'env' | 'none';
  configured: boolean;
  missingFields: string[];
}

/**
 * 小程序凭据配置：数据库优先、`.env` 兜底，与支付渠道配置同一套规则。
 *
 * 三条约束沿用支付域的做法：
 * 1. AppSecret 以 AES-256-GCM 密文入库，主密钥只在 `.env` 的 CONFIG_ENCRYPTION_KEY；
 * 2. 读取接口只回掩码与指纹，明文永不经过 HTTP 响应；
 * 3. 提交回来等于掩码的值视为「不修改」。
 */
@Injectable()
export class MiniProgramConfigService {
  private readonly logger = new Logger(MiniProgramConfigService.name);
  private encryptionKey: Buffer | null = null;

  constructor(
    @InjectRepository(MiniProgramConfig)
    private readonly configs: Repository<MiniProgramConfig>,
    private readonly configService: ConfigService<ConfigRoot, true>,
    private readonly redis: RedisService,
  ) {}

  async getEffective(): Promise<EffectiveMiniProgramConfig> {
    const cached = await this.redis.getJson<EffectiveMiniProgramConfig>(
      CacheKey.miniProgramConfig(),
    );
    if (cached) {
      return cached;
    }
    const effective = await this.buildEffective();
    await this.redis.setJson(
      CacheKey.miniProgramConfig(),
      effective,
      CacheTtl.miniProgramConfig,
    );
    return effective;
  }

  async getView(): Promise<MiniProgramConfigView> {
    const row = await this.findRow();
    const env = this.envDefaults();
    const effective = await this.buildEffective();
    const secret = effective.appSecret;

    return {
      appId: effective.appId || null,
      loginEnabled: effective.loginEnabled,
      secretConfigured: secret.length > 0,
      secretMasked: secret.length > 0 ? SECRET_MASK : '',
      secretFingerprint: secret.length > 0 ? fingerprint(secret) : null,
      source: effective.source,
      configured: effective.configured,
      missingFields: effective.missingFields,
      updatedAt: row?.updatedAt ?? null,
      updatedByName: row?.updatedByName ?? null,
      // 环境兜底值是否存在也要让平台看得见，否则「数据库没配」与「配了但清空了」无法区分
      ...this.buildEnvHint(env.appId.length > 0 || env.appSecret.length > 0),
    };
  }

  async update(
    dto: UpdateMiniProgramConfigDto,
    operator: { id: number; name: string },
  ): Promise<MiniProgramConfigView> {
    const row =
      (await this.findRow()) ?? this.configs.create({ slot: SLOT, loginEnabled: true });

    row.appId = dto.appId.trim();
    if (dto.loginEnabled !== undefined) {
      row.loginEnabled = dto.loginEnabled;
    }
    if (dto.appSecret !== undefined && !looksLikeMask(dto.appSecret)) {
      const trimmed = dto.appSecret.trim();
      row.appSecretEncrypted = trimmed
        ? encryptSecret(trimmed, this.requireEncryptionKey())
        : null;
    }

    row.updatedById = operator.id;
    row.updatedByName = operator.name;
    await this.configs.save(row);
    await this.invalidate();

    this.logger.log(`小程序配置已更新（操作人 ${operator.name}）`);
    return this.getView();
  }

  /** 登录前置闸门：配置缺失与开关关闭给出不同提示，避免顾客看到一句笼统的"登录失败"。 */
  async assertLoginAvailable(): Promise<EffectiveMiniProgramConfig> {
    const effective = await this.getEffective();
    if (!effective.loginEnabled) {
      throw BusinessException.badRequest('小程序登录已被平台关闭');
    }
    if (!effective.configured) {
      throw BusinessException.badRequest(
        `小程序登录尚未完成配置：${effective.missingFields.join('、') || '凭据缺失'}，请平台运营在「小程序配置」中填写`,
      );
    }
    return effective;
  }

  private async buildEffective(): Promise<EffectiveMiniProgramConfig> {
    const row = await this.findRow();
    const env = this.envDefaults();
    const key = row?.appSecretEncrypted && isEncrypted(row.appSecretEncrypted)
      ? this.getEncryptionKey()
      : null;

    const storedSecret = row?.appSecretEncrypted ?? null;
    const decrypted = storedSecret
      ? isEncrypted(storedSecret)
        ? key
          ? this.safeDecrypt(storedSecret, key)
          : ''
        : storedSecret
      : '';

    const appId = row?.appId?.trim() || env.appId;
    const appSecret = decrypted || env.appSecret;
    const missingFields: string[] = [];
    if (!appId) {
      missingFields.push('AppID');
    }
    if (!appSecret) {
      missingFields.push('AppSecret');
    }

    return {
      loginEnabled: row ? Boolean(row.loginEnabled) : true,
      appId,
      appSecret,
      source: row?.appId ? 'database' : appId ? 'env' : 'none',
      configured: missingFields.length === 0,
      missingFields,
    };
  }

  /** 主密钥轮换或数据被手工改过时会解密失败，这里降级成「未配置」而不是让登录 500。 */
  private safeDecrypt(stored: string, key: Buffer): string {
    try {
      return decryptSecret(stored, key);
    } catch (error) {
      this.logger.error(
        `解密 AppSecret 失败，请检查 CONFIG_ENCRYPTION_KEY 是否变更：${error instanceof Error ? error.message : String(error)}`,
      );
      return '';
    }
  }

  private findRow(): Promise<MiniProgramConfig | null> {
    return this.configs.findOne({ where: { slot: SLOT } });
  }

  private envDefaults(): { appId: string; appSecret: string } {
    const miniProgram = this.configService.get('app', { infer: true }).miniProgram;
    return { appId: miniProgram.appId, appSecret: miniProgram.appSecret };
  }

  private buildEnvHint(envConfigured: boolean): { envFallbackAvailable: boolean } {
    return { envFallbackAvailable: envConfigured };
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
      // 主密钥长度或编码不对时按「未配置」处理：保存动作会收到一句能照做的提示，
      // 而不是让 CONFIG_ENCRYPTION_KEY 的解析异常变成一个 500。
      this.encryptionKey = null;
      this.logger.error(
        `CONFIG_ENCRYPTION_KEY 无法解析为 32 字节主密钥：${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return this.encryptionKey;
  }

  private requireEncryptionKey(): Buffer {
    const key = this.getEncryptionKey();
    if (!key) {
      throw BusinessException.badRequest(
        '未配置 CONFIG_ENCRYPTION_KEY，无法加密保存 AppSecret。请在 .env 中配置 32 字节主密钥后重试',
      );
    }
    return key;
  }

  private async invalidate(): Promise<void> {
    await this.redis.del(CacheKey.miniProgramConfig());
  }
}
