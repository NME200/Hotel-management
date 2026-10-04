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
import type { ConfigRoot } from '../../config/configuration';
import { PrintProviderConfig } from '../../database/entities/print-provider-config.entity';
import { RedisService } from '../redis/redis.service';
import {
  PRINT_PROVIDER_LABELS,
  PRINT_PROVIDER_REQUIRED_FIELDS,
  PRINT_PROVIDER_SECRET_FIELDS,
  PRINT_SECRET_FIELD_LABELS,
  PrintProvider,
} from './constants/print-provider.constant';
import type { UpdatePrintProviderDto } from './dto/print-provider.dto';
import type {
  EffectivePrintProviderConfig,
  PrintProviderItem,
  PrintSecretFieldView,
} from './models/print-provider.model';
import { CloudPrintProviderRegistry } from './providers/cloud-print-provider.registry';

type SecretField = 'apiKey' | 'clientSecret';

/**
 * 云打印机厂商配置层。
 *
 * 与 `PaymentConfigService` 的三条规则完全一致，因为它们解决的是同一个问题：
 * 1. 密钥密文入库，主密钥只在 `.env`；接口只回掩码 + 指纹；
 * 2. 提交回来等于掩码的值一律视为「不修改」；
 * 3. 数据库没配时回落 `.env`，保证首次部署不会因为表里空数据而无法出纸。
 *
 * 有了这一层，商家端才可能只填一个设备号就出纸 ——
 * 厂商账号、密钥、网关地址全部在这里收口。
 */
@Injectable()
export class PrintProviderConfigService {
  private readonly logger = new Logger(PrintProviderConfigService.name);
  private encryptionKey: Buffer | null = null;

  constructor(
    @InjectRepository(PrintProviderConfig)
    private readonly configs: Repository<PrintProviderConfig>,
    private readonly configService: ConfigService<ConfigRoot, true>,
    private readonly redis: RedisService,
    private readonly registry: CloudPrintProviderRegistry,
  ) {}

  /* ======================= 平台端 ======================= */

  async list(): Promise<PrintProviderItem[]> {
    const rows = await this.configs.find();
    const byProvider = new Map(rows.map((row) => [row.provider, row] as const));

    const items: PrintProviderItem[] = [];
    for (const provider of Object.values(PrintProvider)) {
      const row = byProvider.get(provider) ?? null;
      const effective = await this.getEffective(provider);
      items.push({
        provider,
        label: PRINT_PROVIDER_LABELS[provider],
        enabled: effective.enabled,
        configured: effective.configured,
        missingFields: effective.missingFields,
        source: effective.source,
        account: provider === PrintProvider.Feie ? effective.uid || null : effective.clientId || null,
        baseUrl: effective.baseUrl,
        baseUrlOverride: row?.baseUrl ?? null,
        secretFields: this.buildSecretFields(provider, row),
        updatedAt: row?.updatedAt ?? null,
        updatedByName: row?.updatedByName ?? null,
      });
    }
    return items;
  }

  async update(
    provider: PrintProvider,
    dto: UpdatePrintProviderDto,
    operator: { id: number; name: string },
  ): Promise<PrintProviderItem> {
    const row =
      (await this.configs.findOne({ where: { provider } })) ??
      this.configs.create({ provider, enabled: false });

    if (dto.enabled !== undefined) {
      row.enabled = dto.enabled;
    }
    if (dto.baseUrl !== undefined) {
      row.baseUrl = trimOrNull(dto.baseUrl);
    }
    if (provider === PrintProvider.Feie && dto.uid !== undefined) {
      row.uid = trimOrNull(dto.uid);
    }
    if (provider === PrintProvider.Yilianyun && dto.clientId !== undefined) {
      row.clientId = trimOrNull(dto.clientId);
    }

    for (const field of PRINT_PROVIDER_SECRET_FIELDS[provider]) {
      const incoming = dto.secrets?.[field];
      // 掩码原样带回表示「沿用原值」，空串才是真的清除
      if (incoming === undefined || incoming === SECRET_MASK) {
        continue;
      }
      this.setSecret(
        row,
        field,
        incoming === '' ? null : encryptSecret(incoming, this.requireEncryptionKey()),
      );
    }

    row.updatedById = operator.id;
    row.updatedByName = operator.name;
    await this.configs.save(row);
    await this.invalidate(provider);

    this.logger.log(`云打印厂商配置已更新：${provider}（操作人 ${operator.name}）`);
    return (await this.list()).find((item) => item.provider === provider)!;
  }

  /** 自检：先验凭据齐备，再真的去网关换一次访问权。 */
  async test(
    provider: PrintProvider,
  ): Promise<{ ok: boolean; message: string; checkedAt: Date }> {
    const checkedAt = new Date();
    const effective = await this.getEffective(provider);

    if (effective.missingFields.length > 0) {
      return {
        ok: false,
        message: `缺少必填配置：${effective.missingFields.join('、')}`,
        checkedAt,
      };
    }
    if (!this.registry.has(provider)) {
      return { ok: false, message: `厂商「${provider}」尚未接入实现`, checkedAt };
    }

    const result = await this.registry.requireReady(provider, effective).probe(effective);
    return { ...result, checkedAt };
  }

  /* ======================= 生效配置 ======================= */

  /** 生效配置：数据库优先，缺失字段回落 `.env`。缓存 60 秒，保存时主动失效。 */
  async getEffective(provider: PrintProvider): Promise<EffectivePrintProviderConfig> {
    const cacheKey = CacheKey.printProvider(provider);
    const cached = await this.redis.getJson<EffectivePrintProviderConfig>(cacheKey);
    if (cached) {
      return cached;
    }

    const effective = await this.buildEffective(provider);
    await this.redis.setJson(cacheKey, effective, CacheTtl.printProvider);
    return effective;
  }

  /* ======================= 内部 ======================= */

  private async buildEffective(provider: PrintProvider): Promise<EffectivePrintProviderConfig> {
    const row = await this.configs.findOne({ where: { provider } });
    const env = this.envDefaults(provider);
    const key = this.getEncryptionKey();

    const readSecret = (stored: string | null | undefined, fallback: string): string => {
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
        // 主密钥轮换或数据被手工改过：降级成「未配置」而不是让推单 500
        this.logger.error(
          `解密 ${provider} 密钥失败，请检查 CONFIG_ENCRYPTION_KEY：${error instanceof Error ? error.message : String(error)}`,
        );
        return '';
      }
    };

    const values: Record<string, string> = {
      uid: row?.uid || env.uid,
      clientId: row?.clientId || env.clientId,
      apiKey: readSecret(row?.apiKeyEncrypted, env.apiKey),
      clientSecret: readSecret(row?.clientSecretEncrypted, env.clientSecret),
    };

    const missingFields = PRINT_PROVIDER_REQUIRED_FIELDS[provider].filter(
      (field) => !values[field]?.length,
    );

    return {
      provider,
      enabled: row ? Boolean(row.enabled) : env.enabledByDefault,
      uid: values.uid ?? '',
      apiKey: values.apiKey ?? '',
      clientId: values.clientId ?? '',
      clientSecret: values.clientSecret ?? '',
      baseUrl: row?.baseUrl || env.baseUrl,
      source: row ? 'database' : env.enabledByDefault ? 'env' : 'none',
      missingFields,
      configured: missingFields.length === 0,
    };
  }

  private envDefaults(provider: PrintProvider): {
    uid: string;
    clientId: string;
    apiKey: string;
    clientSecret: string;
    baseUrl: string;
    enabledByDefault: boolean;
  } {
    const print = this.configService.get('app', { infer: true }).print;

    if (provider === PrintProvider.Feie) {
      return {
        uid: print.feie.uid,
        clientId: '',
        apiKey: print.feie.apiKey,
        clientSecret: '',
        baseUrl: print.feie.baseUrl,
        enabledByDefault: print.feie.enabled,
      };
    }

    return {
      uid: '',
      clientId: print.yilianyun.clientId,
      apiKey: '',
      clientSecret: print.yilianyun.clientSecret,
      baseUrl: print.yilianyun.baseUrl,
      enabledByDefault: print.yilianyun.enabled,
    };
  }

  private buildSecretFields(
    provider: PrintProvider,
    row: PrintProviderConfig | null,
  ): PrintSecretFieldView[] {
    const env = this.envDefaults(provider);
    const key = this.getEncryptionKey();

    return PRINT_PROVIDER_SECRET_FIELDS[provider].map((name) => {
      const stored = this.getSecret(row, name);
      const plain = stored
        ? isEncrypted(stored)
          ? key
            ? this.safeDecrypt(stored, key)
            : ''
          : stored
        : name === 'apiKey'
          ? env.apiKey
          : env.clientSecret;
      const configured = plain.length > 0;
      return {
        name,
        label: PRINT_SECRET_FIELD_LABELS[name] ?? name,
        configured,
        masked: configured ? SECRET_MASK : '',
        fingerprint: configured ? fingerprint(plain) : null,
      };
    });
  }

  private safeDecrypt(stored: string, key: Buffer): string {
    try {
      return decryptSecret(stored, key);
    } catch {
      return '';
    }
  }

  private getSecret(row: PrintProviderConfig | null, field: SecretField): string | null {
    if (!row) {
      return null;
    }
    return field === 'apiKey' ? row.apiKeyEncrypted : row.clientSecretEncrypted;
  }

  private setSecret(
    row: PrintProviderConfig,
    field: SecretField,
    value: string | null,
  ): void {
    if (field === 'apiKey') {
      row.apiKeyEncrypted = value;
    } else {
      row.clientSecretEncrypted = value;
    }
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
        '未配置 CONFIG_ENCRYPTION_KEY，无法加密保存厂商密钥。请在 .env 中配置 32 字节主密钥后重试',
      );
    }
    return key;
  }

  private async invalidate(provider: PrintProvider): Promise<void> {
    await this.redis.del(CacheKey.printProvider(provider));
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
