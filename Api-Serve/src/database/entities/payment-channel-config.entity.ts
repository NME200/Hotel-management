import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/**
 * 支付渠道级配置（平台侧，每渠道一行）。
 *
 * 列按语义命名而不是按渠道命名，微信与支付宝共用同一组字段：
 * 微信用 mchId/apiKey/serialNo/publicKeyId，支付宝用 sandbox，
 * 这样新增渠道时是加行而不是加列。
 *
 * 三个 *Encrypted 列存 AES-256-GCM 密文，主密钥只在 .env，
 * 未配置时读取会回落到 .env 里的同名值（见 PaymentConfigService）。
 */
@Entity('payment_channel_config', { comment: '支付渠道配置' })
export class PaymentChannelConfig extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 16, comment: '渠道 wechat|alipay|mock' })
  channel!: string;

  @Column({ type: 'boolean', default: false, comment: '平台侧渠道总开关' })
  enabled!: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '异步通知地址' })
  notifyUrl!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: 'AppID' })
  appId!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '微信服务商商户号' })
  mchId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '商户证书序列号' })
  serialNo!: string | null;

  @Column({ type: 'boolean', nullable: true, comment: '支付宝沙箱开关' })
  sandbox!: boolean | null;

  @Column({ type: 'text', nullable: true, comment: 'APIv3 密钥（密文）' })
  apiKeyEncrypted!: string | null;

  @Column({ type: 'text', nullable: true, comment: '商户/应用私钥（密文）' })
  privateKeyEncrypted!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '平台公钥 ID' })
  publicKeyId!: string | null;

  @Column({ type: 'text', nullable: true, comment: '平台/支付宝公钥（密文）' })
  publicKeyEncrypted!: string | null;

  @Column({ type: 'int', nullable: true, comment: '最后修改人 ID' })
  updatedById!: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '最后修改人姓名' })
  updatedByName!: string | null;
}
