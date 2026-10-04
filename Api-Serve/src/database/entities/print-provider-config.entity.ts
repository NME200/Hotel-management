import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/**
 * 云打印机厂商配置（平台侧，每厂商一行）。
 *
 * 为什么密钥放平台而不是放商户：飞鹅 / 易联云 的网关凭据是**平台与厂商之间的
 * 一份合同关系**——一个 uid / client_id 下挂多台设备，商户各自去申请一套既拿不到
 * 也管不住。所以商家端只填设备号（sn），密钥全部由平台统一配置，
 * 与支付渠道密钥同一条安全线：加密入库、只回掩码 + 指纹、`.env` 兜底。
 *
 * 与支付渠道表一样按语义命名而不是按厂商命名：
 * 飞鹅用 `uid` + `apiKey`，易联云用 `clientId` + `clientSecret`，
 * 新增厂商时是加行而不是加列。
 */
@Entity('print_provider_config', { comment: '云打印机厂商配置' })
export class PrintProviderConfig extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32, comment: '厂商机器码 feie|yilianyun' })
  provider!: string;

  @Column({ type: 'boolean', default: false, comment: '平台侧厂商总开关' })
  enabled!: boolean;

  /**
   * 飞鹅用后台登录账号（官方参数名 user，列名沿用 uid）；易联云留空（它靠 client_id 识别应用）。
   * 这列不放密文，因为它更像"账号名"——出现泄露的后果是别人知道你是谁，
   * 而不是能冒充你出纸。
   */
  @Column({ type: 'varchar', length: 64, nullable: true, comment: '飞鹅账号 user（后台登录名，一般是邮箱；列名沿用 uid）' })
  uid!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '易联云应用 client_id' })
  clientId!: string | null;

  @Column({ type: 'text', nullable: true, comment: '飞鹅 UKEY（密文）' })
  apiKeyEncrypted!: string | null;

  @Column({ type: 'text', nullable: true, comment: '易联云 client_secret（密文）' })
  clientSecretEncrypted!: string | null;

  /**
   * 网关地址可改是为了让联调能指向沙箱或自建代理。
   * 留空即用 configuration.ts 里的官方地址，避免升级后老配置指向过期域名。
   */
  @Column({ type: 'varchar', length: 255, nullable: true, comment: '网关地址覆盖，留空用官方地址' })
  baseUrl!: string | null;

  @Column({ type: 'int', nullable: true, comment: '最后修改人 ID' })
  updatedById!: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '最后修改人姓名' })
  updatedByName!: string | null;
}
