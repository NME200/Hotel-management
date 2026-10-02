import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

/**
 * 顾客小程序凭据配置（平台侧，全局一行）。
 *
 * app_secret_encrypted 存 AES-256-GCM 密文，主密钥只在 .env 的 CONFIG_ENCRYPTION_KEY；
 * 读取接口永不回显明文，只回掩码与指纹。表里没配时回落 .env 的 MINI_APP_ID / MINI_APP_SECRET，
 * 保证首次部署不会因为表里空数据而全站登录不可用。
 */
@Entity('mini_program_config', { comment: '顾客小程序配置（全局单行）' })
export class MiniProgramConfig extends BaseEntity {
  @Index({ unique: true })
  @Column({
    type: 'varchar',
    length: 16,
    default: 'global',
    comment: '配置槽位，全局只有一行',
  })
  slot!: string;

  @Column({ type: 'boolean', default: true, comment: '小程序登录开关' })
  loginEnabled!: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '小程序 AppID' })
  appId!: string | null;

  @Column({ type: 'text', nullable: true, comment: '小程序 AppSecret（密文）' })
  appSecretEncrypted!: string | null;

  @Column({ type: 'int', nullable: true, comment: '最后修改人 ID' })
  updatedById!: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '最后修改人姓名' })
  updatedByName!: string | null;
}
