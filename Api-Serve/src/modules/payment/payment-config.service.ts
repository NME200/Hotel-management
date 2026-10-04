import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { readFileSync } from 'node:fs';
import { In, Like, Repository, type FindOptionsWhere } from 'typeorm';
import { CacheKey } from '../../common/constants/cache-key';
import type { PageResult } from '../../common/dto/page-result.dto';
import { buildPageResult } from '../../common/dto/page-result.dto';
import { toSkipTake } from '../../common/dto/page-query.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import {
  decryptSecret,
  encryptSecret,
  fingerprint,
  isEncrypted,
  maskAccountNumber,
  parseEncryptionKey,
  SECRET_MASK,
} from '../../common/utils/crypto.util';
import { likePattern } from '../../common/utils/like.util';
import { Merchant } from '../../database/entities/merchant.entity';
import { MerchantPaymentConfig } from '../../database/entities/merchant-payment-config.entity';
import { PaymentChannelConfig } from '../../database/entities/payment-channel-config.entity';
import { RedisService } from '../redis/redis.service';
import { PaymentChannel, isOfflineChannel, ONLINE_CHANNELS } from './constants/payment.constant';
import type {
  MerchantApplyDto,
  MerchantAuditDto,
  UpdateChannelConfigDto,
} from './dto/payment-config.dto';
import type { MerchantPaymentPageQueryDto } from './dto/payment-config.dto';
import {
  CHANNEL_LABELS,
  CHANNEL_REQUIRED_FIELDS,
  CHANNEL_SECRET_FIELDS,
  MerchantPaymentStatus,
  SECRET_FIELD_LABELS,
  type EffectiveChannelConfig,
  type MerchantPaymentConfigItem,
  type MerchantPaymentSummary,
  type PayableContext,
  type PaymentChannelItem,
  type SecretFieldView,
} from './models/payment-config.model';
import type { ConfigRoot } from '../../config/configuration';

const CONFIG_CACHE_TTL_SECONDS = 60;

interface ChannelDefaults {
  appId: string;
  mchId: string;
  apiKey: string;
  serialNo: string;
  privateKey: string;
  publicKeyId: string;
  publicKey: string;
  notifyUrl: string;
  sandbox: boolean;
  enabledByDefault: boolean;
}

/**
 * 支付配置层：渠道级密钥（平台侧）与商户级进件开通状态。
 *
 * 三条不可妥协的规则：
 * 1. 密钥密文入库，主密钥只在 .env；接口永远不回显明文，只回掩码 + 指纹。
 * 2. 提交回来等于掩码的值一律视为"不修改"，否则前端会把 ******** 写进库把密钥覆盖掉。
 * 3. 数据库没配时回落 .env，保证第一次部署不会因为表里空数据而全站支付不可用。
 */
@Injectable()
export class PaymentConfigService {
  private readonly logger = new Logger(PaymentConfigService.name);
  private encryptionKey: Buffer | null = null;
  private readonly fileCache = new Map<string, string>();

  constructor(
    @InjectRepository(PaymentChannelConfig)
    private readonly channels: Repository<PaymentChannelConfig>,
    @InjectRepository(MerchantPaymentConfig)
    private readonly merchantConfigs: Repository<MerchantPaymentConfig>,
    @InjectRepository(Merchant)
    private readonly merchants: Repository<Merchant>,
    private readonly configService: ConfigService<ConfigRoot, true>,
    private readonly redis: RedisService,
  ) {}

  /* ======================= 渠道级 ======================= */

  async listChannels(): Promise<PaymentChannelItem[]> {
    const rows = await this.channels.find();
    const byChannel = new Map(rows.map((row) => [row.channel, row] as const));

    const items: PaymentChannelItem[] = [];
    // 只列在线渠道：现金与收款码不需要平台配开关或密钥，出现在这里只会让人以为要去配它
    for (const channel of ONLINE_CHANNELS) {
      const row = byChannel.get(channel) ?? null;
      const effective = await this.getEffective(channel);
      items.push({
        channel,
        label: CHANNEL_LABELS[channel],
        enabled: effective.enabled,
        ready: effective.ready,
        missingFields: effective.missingFields,
        source: effective.source,
        notifyUrl: effective.notifyUrl || null,
        appId: effective.appId || null,
        mchId: effective.mchId || null,
        sandbox: channel === PaymentChannel.Alipay ? effective.sandbox : null,
        secretFields: this.buildSecretFields(channel, row),
        updatedAt: row?.updatedAt ?? null,
      });
    }
    return items;
  }

  async updateChannel(
    channel: PaymentChannel,
    dto: UpdateChannelConfigDto,
    operator: { id: number; name: string },
  ): Promise<PaymentChannelItem> {
    this.assertOnlineChannel(channel, '配置');

    const row =
      (await this.channels.findOne({ where: { channel } })) ??
      this.channels.create({ channel, enabled: false });

    if (dto.enabled !== undefined) {
      row.enabled = dto.enabled;
    }
    if (dto.notifyUrl !== undefined) {
      row.notifyUrl = trimOrNull(dto.notifyUrl);
    }
    if (dto.appId !== undefined) {
      row.appId = trimOrNull(dto.appId);
    }
    if (dto.mchId !== undefined) {
      row.mchId = trimOrNull(dto.mchId);
    }
    if (dto.serialNo !== undefined) {
      row.serialNo = trimOrNull(dto.serialNo);
    }
    if (dto.publicKeyId !== undefined) {
      row.publicKeyId = trimOrNull(dto.publicKeyId);
    }
    if (dto.sandbox !== undefined) {
      row.sandbox = dto.sandbox;
    }

    for (const field of CHANNEL_SECRET_FIELDS[channel]) {
      const incoming = dto.secrets?.[field];
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
    await this.channels.save(row);
    await this.invalidate(channel);

    return (await this.listChannels()).find((item) => item.channel === channel)!;
  }

  /** 生效配置：数据库优先，缺失字段回落 .env。缓存 60 秒，保存时主动失效。 */
  async getEffective(channel: PaymentChannel): Promise<EffectiveChannelConfig> {
    const cacheKey = CacheKey.paymentChannel(channel);
    const cached = await this.redis.getJson<EffectiveChannelConfig>(cacheKey);
    if (cached) {
      return cached;
    }

    const effective = await this.buildEffective(channel);
    await this.redis.setJson(cacheKey, effective, CONFIG_CACHE_TTL_SECONDS);
    return effective;
  }

  async testChannel(channel: PaymentChannel): Promise<{ ok: boolean; message: string; checkedAt: Date }> {
    const checkedAt = new Date();

    // 线下渠道没有可连通的东西要测，恒可用
    if (isOfflineChannel(channel)) {
      return {
        ok: true,
        message: '线下收款渠道，无需配置，始终可用',
        checkedAt,
      };
    }

    if (channel === PaymentChannel.Mock) {
      const enabled = this.configService.get('app', { infer: true }).payment.mock.enabled;
      return {
        ok: enabled,
        message: enabled ? '模拟渠道可用（仅非生产环境）' : '模拟渠道已关闭（生产环境或未启用）',
        checkedAt,
      };
    }

    const effective = await this.getEffective(channel);
    if (!effective.enabled) {
      return { ok: false, message: '渠道总开关未打开', checkedAt };
    }
    if (effective.missingFields.length > 0) {
      return {
        ok: false,
        message: `缺少必填配置：${effective.missingFields.join('、')}`,
        checkedAt,
      };
    }
    if (channel === PaymentChannel.Wechat && !effective.notifyUrl.startsWith('https://')) {
      return { ok: false, message: '微信支付通知地址必须为 https 公网地址', checkedAt };
    }
    return {
      ok: false,
      message: '配置校验通过，但该渠道实现尚未接入，无法真正连通',
      checkedAt,
    };
  }

  /* ======================= 商户级 ======================= */

  /** 商家端：固定返回三条在线渠道，未申请的合成 not_applied；线下渠道不走进件，不在此列。 */
  async listForMerchant(merchantId: number): Promise<MerchantPaymentConfigItem[]> {
    const rows = await this.merchantConfigs.find({ where: { merchantId } });
    const byChannel = new Map(rows.map((row) => [row.channel, row] as const));

    const items: MerchantPaymentConfigItem[] = [];
    for (const channel of ONLINE_CHANNELS) {
      const effective = await this.getEffective(channel);
      items.push(
        this.buildMerchantItem(
          byChannel.get(channel) ?? null,
          merchantId,
          channel,
          effective.enabled && effective.ready,
        ),
      );
    }
    return items;
  }

  async apply(
    merchantId: number,
    dto: MerchantApplyDto,
    operator: { id: number; name: string },
  ): Promise<MerchantPaymentConfigItem> {
    this.assertOnlineChannel(dto.channel, '进件');

    const effective = await this.getEffective(dto.channel);
    if (!effective.enabled || !effective.ready) {
      throw BusinessException.badRequest(`${CHANNEL_LABELS[dto.channel]}尚未开放，请联系平台运营`);
    }

    const existing = await this.merchantConfigs.findOne({
      where: { merchantId, channel: dto.channel },
    });
    const wasEnabled = existing?.status === MerchantPaymentStatus.Enabled;
    const row = existing ?? this.merchantConfigs.create({ merchantId, channel: dto.channel });

    row.channelAccount = dto.channelAccount.trim();
    row.settleAccountName = trimOrNull(dto.settleAccountName);
    // 结算账号留空表示沿用原值：后端只回脱敏值，前端无法回填真实账号
    if (dto.settleAccountNo) {
      row.settleAccountNoEncrypted = encryptSecret(
        dto.settleAccountNo.trim(),
        this.requireEncryptionKey(),
      );
    }
    row.licenseNo = trimOrNull(dto.licenseNo);
    row.contactName = trimOrNull(dto.contactName);
    row.contactPhone = trimOrNull(dto.contactPhone);
    row.status = MerchantPaymentStatus.PendingAudit;
    row.appliedAt = new Date();
    row.appliedById = operator.id;
    row.appliedByName = operator.name;
    // 重新提交即进入待审核，上一次的审核结论要清空，否则列表会显示「待审核 + 上次审核人」
    row.auditRemark = null;
    row.auditedAt = null;
    row.auditedById = null;
    row.auditedByName = null;

    await this.merchantConfigs.save(row);
    this.logger.log(
      `商户 ${merchantId} 提交 ${dto.channel} 进件资料（${wasEnabled ? '修改已开通渠道，需重新审核' : '首次申请'}）`,
    );
    return this.buildMerchantItem(row, merchantId, dto.channel, true);
  }

  /** 平台端列表：只列真实存在的进件记录，某商户的全渠道合成视图用 listForMerchant。 */
  async pageForPlatform(
    query: MerchantPaymentPageQueryDto,
  ): Promise<PageResult<MerchantPaymentConfigItem>> {
    const { skip, take } = toSkipTake(query.page, query.pageSize);
    const where = await this.buildPlatformWhere(query);
    const [rows, total] = await this.merchantConfigs.findAndCount({
      where,
      order: { id: 'DESC' },
      skip,
      take,
    });

    const merchantIds = [...new Set(rows.map((row) => row.merchantId))];
    const merchants = merchantIds.length
      ? await this.merchants.find({ where: { id: In(merchantIds) } })
      : [];
    const merchantMap = new Map(merchants.map((item) => [item.id, item] as const));

    const list: MerchantPaymentConfigItem[] = [];
    for (const row of rows) {
      const channel = row.channel as PaymentChannel;
      const effective = await this.getEffective(channel);
      const merchant = merchantMap.get(row.merchantId);
      list.push({
        ...this.buildMerchantItem(row, row.merchantId, channel, effective.enabled && effective.ready),
        merchantCode: merchant?.code ?? '-',
        merchantName: merchant?.name ?? '-',
      });
    }

    return buildPageResult(list, total, query.page, query.pageSize);
  }

  async summary(): Promise<MerchantPaymentSummary> {
    const [pendingAudit, enabled, rejected, disabled, merchantTotal, configuredRows] =
      await Promise.all([
        this.merchantConfigs.count({ where: { status: MerchantPaymentStatus.PendingAudit } }),
        this.merchantConfigs.count({ where: { status: MerchantPaymentStatus.Enabled } }),
        this.merchantConfigs.count({ where: { status: MerchantPaymentStatus.Rejected } }),
        this.merchantConfigs.count({ where: { status: MerchantPaymentStatus.Disabled } }),
        this.merchants.count(),
        this.merchantConfigs.count(),
      ]);

    // 未申请 = 商户数 × 渠道数 - 已有进件记录数，和单商户全渠道视图的口径一致
    const notApplied = Math.max(merchantTotal * Object.values(PaymentChannel).length - configuredRows, 0);
    return { pendingAudit, enabled, rejected, disabled, notApplied };
  }

  async audit(
    id: number,
    dto: MerchantAuditDto,
    operator: { id: number; name: string },
  ): Promise<MerchantPaymentConfigItem> {
    const row = await this.merchantConfigs.findOne({ where: { id } });
    if (!row) {
      throw BusinessException.notFound('进件申请不存在');
    }
    if (row.status !== MerchantPaymentStatus.PendingAudit) {
      throw BusinessException.conflict('该申请已处理，请刷新后查看');
    }
    if (!dto.approved && !dto.auditRemark?.trim()) {
      throw BusinessException.badRequest('驳回必须填写审核意见');
    }

    row.status = dto.approved
      ? MerchantPaymentStatus.Enabled
      : MerchantPaymentStatus.Rejected;
    row.auditedAt = new Date();
    row.auditedById = operator.id;
    row.auditedByName = operator.name;
    row.auditRemark = trimOrNull(dto.auditRemark);
    if (dto.approved) {
      if (dto.feeRate !== undefined) {
        row.feeRate = dto.feeRate;
      }
      if (dto.profitShareRate !== undefined) {
        row.profitShareRate = dto.profitShareRate;
      }
    }

    await this.merchantConfigs.save(row);
    return this.toItemWithOpenState(row);
  }

  /** 平台随时启停某商户某渠道 —— 这就是"平台决定商户能用哪种支付方式"的入口。 */
  async setStatus(
    id: number,
    status: 'enabled' | 'disabled',
    operator: { id: number; name: string },
  ): Promise<MerchantPaymentConfigItem> {
    const row = await this.merchantConfigs.findOne({ where: { id } });
    if (!row) {
      throw BusinessException.notFound('进件配置不存在');
    }
    if (status === MerchantPaymentStatus.Enabled && row.status !== MerchantPaymentStatus.Disabled) {
      throw BusinessException.conflict('只有已停用的渠道可以直接启用');
    }
    if (status === MerchantPaymentStatus.Disabled && row.status !== MerchantPaymentStatus.Enabled) {
      throw BusinessException.conflict('该渠道当前不是已开通状态');
    }

    row.status = status;
    row.auditedAt = new Date();
    row.auditedById = operator.id;
    row.auditedByName = operator.name;
    await this.merchantConfigs.save(row);
    return this.toItemWithOpenState(row);
  }

  /** 下单前置校验 + 参数装配：渠道总开关、凭据就绪、商户已开通，三段各给不同提示。 */
  async resolvePayable(
    merchantId: number,
    channel: PaymentChannel,
  ): Promise<PayableContext> {
    // 线下收款不经过渠道：没有平台总开关、没有商户进件、没有收款账号与费率，
    // 因此直接放行，而不是去查一张永远不会有记录的配置表。
    if (isOfflineChannel(channel)) {
      return {
        effective: this.offlineEffective(channel),
        channelAccount: null,
        feeRate: null,
        profitShareRate: null,
      };
    }

    const effective = await this.getEffective(channel);
    if (!effective.enabled) {
      throw BusinessException.badRequest(`${CHANNEL_LABELS[channel]}渠道未开放`);
    }
    if (!effective.ready) {
      throw BusinessException.badRequest(
        `${CHANNEL_LABELS[channel]}尚未就绪${effective.missingFields.length ? `，缺少：${effective.missingFields.join('、')}` : '，渠道实现未接入'}`,
      );
    }

    const row = await this.merchantConfigs.findOne({ where: { merchantId, channel } });
    if (!row) {
      throw BusinessException.badRequest(`该商户尚未申请开通${CHANNEL_LABELS[channel]}`);
    }
    if (row.status === MerchantPaymentStatus.PendingAudit) {
      throw BusinessException.badRequest(`${CHANNEL_LABELS[channel]}进件资料审核中，暂时无法收款`);
    }
    if (row.status === MerchantPaymentStatus.Rejected) {
      throw BusinessException.badRequest(
        `${CHANNEL_LABELS[channel]}进件被驳回：${row.auditRemark ?? '请联系平台了解详情'}`,
      );
    }
    if (row.status === MerchantPaymentStatus.Disabled) {
      throw BusinessException.badRequest(`${CHANNEL_LABELS[channel]}已被平台停用`);
    }

    return {
      effective,
      channelAccount: row.channelAccount,
      feeRate: row.feeRate,
      profitShareRate: row.profitShareRate,
    };
  }

  /**
   * 只取该商户该渠道的抽佣比例，不做任何可用性校验。
   *
   * 支付成功回调时需要它来生成分账单，但此时不应再走 resolvePayable ——
   * 平台可能刚好在支付成功后停用了该渠道，那样会把已经收到钱的分账丢掉。
   */
  async findProfitShareRate(
    merchantId: number,
    channel: PaymentChannel,
  ): Promise<number | null> {
    const row = await this.merchantConfigs.findOne({ where: { merchantId, channel } });
    return row?.profitShareRate ?? null;
  }

  /* ======================= 内部 ======================= */

  private async buildEffective(channel: PaymentChannel): Promise<EffectiveChannelConfig> {
    const row = await this.channels.findOne({ where: { channel } });
    const env = this.envDefaults(channel);
    const key = row && this.hasAnySecret(row) ? this.getEncryptionKey() : null;

    const readSecret = (stored: string | null | undefined, fallback: string): string => {
      if (!stored) {
        return fallback;
      }
      if (!isEncrypted(stored)) {
        return stored;
      }
      return key ? decryptSecret(stored, key) : '';
    };

    const values: Record<string, string> = {
      appId: row?.appId || env.appId,
      mchId: row?.mchId || env.mchId,
      apiKey: readSecret(row?.apiKeyEncrypted, env.apiKey),
      privateKey: readSecret(row?.privateKeyEncrypted, env.privateKey),
      publicKey: readSecret(row?.publicKeyEncrypted, env.publicKey),
      notifyUrl: row?.notifyUrl || env.notifyUrl,
    };

    const missingFields = CHANNEL_REQUIRED_FIELDS[channel].filter(
      (field) => !values[field]?.length,
    );

    return {
      channel,
      enabled: row ? Boolean(row.enabled) : env.enabledByDefault,
      notifyUrl: values.notifyUrl,
      appId: values.appId,
      mchId: values.mchId,
      serialNo: row?.serialNo || env.serialNo,
      sandbox: row?.sandbox ?? env.sandbox,
      apiKey: values.apiKey,
      privateKey: values.privateKey,
      publicKeyId: row?.publicKeyId || env.publicKeyId,
      publicKey: values.publicKey,
      source: row ? 'database' : env.enabledByDefault ? 'env' : 'none',
      missingFields,
      // 凭据齐备但实现未接入的渠道仍然不算就绪，避免界面误显示"可收款"
      ready: missingFields.length === 0 && this.providerImplemented(channel),
    };
  }

  private providerImplemented(channel: PaymentChannel): boolean {
    // 线下渠道的实现就在进程内（见 providers/offline.provider.ts），永远算已接入
    return channel === PaymentChannel.Mock || isOfflineChannel(channel);
  }

  /** 线下渠道不配开关、不走密钥、不进件；任何试图配置它们的入口都要挡在这里。 */
  private assertOnlineChannel(channel: PaymentChannel, action: string): void {
    if (isOfflineChannel(channel)) {
      throw BusinessException.badRequest(
        `${CHANNEL_LABELS[channel]}是线下收款渠道，无需${action}，收银台可直接使用`,
      );
    }
  }

  /** 线下渠道的「生效配置」是常量：恒启用、恒就绪、无任何凭据字段。 */
  private offlineEffective(channel: PaymentChannel): EffectiveChannelConfig {
    return {
      channel,
      enabled: true,
      notifyUrl: '',
      appId: '',
      mchId: '',
      serialNo: '',
      sandbox: false,
      apiKey: '',
      privateKey: '',
      publicKeyId: '',
      publicKey: '',
      source: 'none',
      missingFields: [],
      ready: true,
    };
  }

  private envDefaults(channel: PaymentChannel): ChannelDefaults {
    const payment = this.configService.get('app', { infer: true }).payment;

    if (channel === PaymentChannel.Wechat) {
      const wechat = payment.wechat;
      return {
        appId: wechat.spAppid,
        mchId: wechat.spMchid,
        apiKey: wechat.apiV3Key,
        serialNo: wechat.mchCertificateSerialNumber,
        privateKey: this.readKeyFile(wechat.mchPrivateKeyPath),
        publicKeyId: wechat.publicKeyId,
        publicKey: this.readKeyFile(wechat.publicKeyPath),
        notifyUrl: wechat.notifyUrl,
        sandbox: false,
        enabledByDefault: wechat.enabled,
      };
    }

    if (channel === PaymentChannel.Alipay) {
      const alipay = payment.alipay;
      return {
        appId: alipay.appId,
        mchId: '',
        apiKey: '',
        serialNo: '',
        privateKey: alipay.privateKey,
        publicKeyId: '',
        publicKey: alipay.alipayPublicKey,
        notifyUrl: alipay.notifyUrl,
        sandbox: alipay.sandbox,
        enabledByDefault: alipay.enabled,
      };
    }

    // 线下渠道不读任何 .env：没有凭据可配，恒启用
    if (isOfflineChannel(channel)) {
      return {
        appId: '',
        mchId: '',
        apiKey: '',
        serialNo: '',
        privateKey: '',
        publicKeyId: '',
        publicKey: '',
        notifyUrl: '',
        sandbox: false,
        enabledByDefault: true,
      };
    }

    return {
      appId: '',
      mchId: '',
      apiKey: '',
      serialNo: '',
      privateKey: '',
      publicKeyId: '',
      publicKey: '',
      notifyUrl: '',
      sandbox: false,
      enabledByDefault: payment.mock.enabled,
    };
  }

  private readKeyFile(path: string): string {
    if (!path) {
      return '';
    }
    const cached = this.fileCache.get(path);
    if (cached !== undefined) {
      return cached;
    }
    try {
      const content = readFileSync(path, 'utf8');
      this.fileCache.set(path, content);
      return content;
    } catch (error) {
      this.logger.warn(
        `读取密钥文件失败 ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.fileCache.set(path, '');
      return '';
    }
  }

  private buildSecretFields(
    channel: PaymentChannel,
    row: PaymentChannelConfig | null,
  ): SecretFieldView[] {
    const env = this.envDefaults(channel);
    const key = this.getEncryptionKey();

    return CHANNEL_SECRET_FIELDS[channel].map((name) => {
      const stored = this.getSecret(row, name);
      const plain = stored
        ? isEncrypted(stored)
          ? key
            ? decryptSecret(stored, key)
            : ''
          : stored
        : env[name];
      const configured = plain.length > 0;
      return {
        name,
        label: SECRET_FIELD_LABELS[name] ?? name,
        configured,
        masked: configured ? SECRET_MASK : '',
        fingerprint: configured ? fingerprint(plain) : null,
      };
    });
  }

  private buildMerchantItem(
    row: MerchantPaymentConfig | null,
    merchantId: number,
    channel: PaymentChannel,
    channelOpen: boolean,
  ): MerchantPaymentConfigItem {
    return {
      id: row?.id ?? null,
      merchantId,
      channel,
      channelLabel: CHANNEL_LABELS[channel],
      status: (row?.status ?? MerchantPaymentStatus.NotApplied) as MerchantPaymentStatus,
      channelAccount: row?.channelAccount ?? null,
      feeRate: row?.feeRate ?? null,
      profitShareRate: row?.profitShareRate ?? null,
      settleAccountName: row?.settleAccountName ?? null,
      settleAccountNoMasked: this.maskSettleAccount(row),
      licenseNo: row?.licenseNo ?? null,
      contactName: row?.contactName ?? null,
      contactPhone: row?.contactPhone ?? null,
      appliedAt: row?.appliedAt ?? null,
      appliedByName: row?.appliedByName ?? null,
      auditedAt: row?.auditedAt ?? null,
      auditedByName: row?.auditedByName ?? null,
      auditRemark: row?.auditRemark ?? null,
      updatedAt: row?.updatedAt ?? null,
      channelOpen,
    };
  }

  private async toItemWithOpenState(
    row: MerchantPaymentConfig,
  ): Promise<MerchantPaymentConfigItem> {
    const channel = row.channel as PaymentChannel;
    const effective = await this.getEffective(channel);
    return this.buildMerchantItem(row, row.merchantId, channel, effective.enabled && effective.ready);
  }

  private maskSettleAccount(row: MerchantPaymentConfig | null): string | null {
    if (!row?.settleAccountNoEncrypted) {
      return null;
    }
    const key = this.getEncryptionKey();
    if (!key || !isEncrypted(row.settleAccountNoEncrypted)) {
      return '****';
    }
    try {
      return maskAccountNumber(decryptSecret(row.settleAccountNoEncrypted, key));
    } catch {
      return '****';
    }
  }

  private async buildPlatformWhere(
    query: MerchantPaymentPageQueryDto,
  ): Promise<FindOptionsWhere<MerchantPaymentConfig>> {
    const where: FindOptionsWhere<MerchantPaymentConfig> = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.channel) {
      where.channel = query.channel;
    }
    if (query.merchantId) {
      where.merchantId = query.merchantId;
    }

    const keyword = query.keyword?.trim();
    if (!keyword) {
      return where;
    }

    const matched = await this.merchants.find({
      where: [
        { name: Like(likePattern(keyword)) },
        { code: Like(likePattern(keyword)) },
      ],
      select: { id: true },
    });
    if (matched.length === 0) {
      where.merchantId = -1;
      return where;
    }

    const ids = matched.map((merchant) => merchant.id);
    where.merchantId = query.merchantId
      ? (ids.includes(query.merchantId) ? query.merchantId : -1)
      : In(ids);
    return where;
  }

  private getSecret(
    row: PaymentChannelConfig | null,
    field: 'apiKey' | 'privateKey' | 'publicKey',
  ): string | null {
    if (!row) {
      return null;
    }
    if (field === 'apiKey') {
      return row.apiKeyEncrypted;
    }
    return field === 'privateKey' ? row.privateKeyEncrypted : row.publicKeyEncrypted;
  }

  private setSecret(
    row: PaymentChannelConfig,
    field: 'apiKey' | 'privateKey' | 'publicKey',
    value: string | null,
  ): void {
    if (field === 'apiKey') {
      row.apiKeyEncrypted = value;
    } else if (field === 'privateKey') {
      row.privateKeyEncrypted = value;
    } else {
      row.publicKeyEncrypted = value;
    }
  }

  private hasAnySecret(row: PaymentChannelConfig): boolean {
    return Boolean(row.apiKeyEncrypted || row.privateKeyEncrypted || row.publicKeyEncrypted);
  }

  private getEncryptionKey(): Buffer | null {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }
    const raw = this.configService.get('app', { infer: true }).payment.configEncryptionKey;
    if (!raw) {
      return null;
    }
    this.encryptionKey = parseEncryptionKey(raw);
    return this.encryptionKey;
  }

  private requireEncryptionKey(): Buffer {
    const key = this.getEncryptionKey();
    if (!key) {
      throw BusinessException.badRequest(
        '未配置 CONFIG_ENCRYPTION_KEY，无法加密保存密钥。请在 .env 中配置 32 字节主密钥后重试',
      );
    }
    return key;
  }

  private async invalidate(channel: PaymentChannel): Promise<void> {
    await this.redis.del(CacheKey.paymentChannel(channel));
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
