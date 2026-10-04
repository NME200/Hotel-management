import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/**
 * 短信验证码配置（平台侧，全局一行）。
 *
 * 为什么放平台而不是商户：短信签名与模板要按**主体**过云厂商审核，
 * 一套凭据服务全部商户，商户自己既申请不下来也不该看到 AccessKey ——
 * 与云打印机厂商配置同一条边界。
 *
 * `access_key_secret_encrypted` 存 AES-256-GCM 密文，主密钥只在 `.env` 的
 * `CONFIG_ENCRYPTION_KEY`；读取接口永不回显明文，只回掩码与指纹。
 * 表里没配的字段回落 `.env`，保证首次部署不会因为表里空数据而发不出验证码。
 */
@Entity('sms_config', { comment: '短信验证码配置（全局单行）' })
export class SmsConfig extends BaseEntity {
  @Index({ unique: true })
  @Column({
    type: 'varchar',
    length: 16,
    default: 'global',
    comment: '配置槽位，全局只有一行',
  })
  slot!: string;

  /** 平台总开关：关掉后所有商户的验证码登录都不可用，顾客仍可走微信一键登录 */
  @Column({ type: 'boolean', default: false, comment: '短信验证码总开关' })
  enabled!: boolean;

  /** 通道：log=只写日志（仅开发环境）| aliyun | tencent | custom=自建/第三方 HTTP 网关；null 回落 .env */
  @Column({
    type: 'varchar',
    length: 16,
    nullable: true,
    comment: '通道 log|aliyun|tencent|custom，空则回落 .env',
  })
  driver!: string | null;

  /**
   * 按语义命名而不是按厂商命名（与 `print_provider_config` 同一条口径）：
   * 阿里云叫 AccessKey ID，腾讯云叫 SecretId，是同一对凭据的两个名字，
   * 换通道时这一列继续用，只是界面上的标签跟着通道变。
   */
  @Column({ type: 'varchar', length: 64, nullable: true, comment: '云厂商 AccessKey ID / SecretId（明文）' })
  accessKeyId!: string | null;

  @Column({ type: 'text', nullable: true, comment: '云厂商 AccessKey Secret / SecretKey（密文）' })
  accessKeySecretEncrypted!: string | null;

  /** 腾讯云独有：短信控制台「应用管理」里的 SdkAppId，阿里云与自定义通道用不到 */
  @Column({ type: 'varchar', length: 64, nullable: true, comment: '腾讯云短信应用 SdkAppId' })
  sdkAppId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '短信签名，如「川味小馆」' })
  signName!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '验证码模板号（阿里云 SMS_xxx / 腾讯云数字模板 ID），变量名固定为 code' })
  templateCode!: string | null;

  /** 阿里云如 cn-hangzhou，腾讯云如 ap-guangzhou；留空按通道取官方默认地域 */
  @Column({ type: 'varchar', length: 32, nullable: true, comment: '地域，如 cn-hangzhou / ap-guangzhou' })
  region!: string | null;

  /** 留空即用代码里的官方地址；能改是为了联调时指向自建代理 */
  @Column({ type: 'varchar', length: 255, nullable: true, comment: '网关地址覆盖，留空用官方地址' })
  endpoint!: string | null;

  /** 自定义通道：请求体 JSON 模板，占位符 {phone} {code} {signName} {templateCode} */
  @Column({ type: 'text', nullable: true, comment: '自定义通道请求体 JSON 模板' })
  customBodyTemplate!: string | null;

  /** 自定义通道：形如 `Authorization: Bearer {token}`；{token} 由下面那列的密钥替换 */
  @Column({ type: 'varchar', length: 255, nullable: true, comment: '自定义通道鉴权头，头名与头值模板以冒号分隔' })
  customAuthHeader!: string | null;

  @Column({ type: 'text', nullable: true, comment: '自定义通道网关密钥（密文）' })
  customTokenEncrypted!: string | null;

  @Column({ type: 'int', nullable: true, comment: '最后修改人 ID' })
  updatedById!: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '最后修改人姓名' })
  updatedByName!: string | null;
}
