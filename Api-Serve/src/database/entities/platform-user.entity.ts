import { Column, Entity, Index } from 'typeorm';
import { AccountStatus } from '../../common/constants/dict';
import { BaseEntity } from './base.entity';

/** 平台运营账号，不属于任何商户。 */
@Entity('platform_user')
export class PlatformUser extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, comment: '登录账号' })
  username!: string;

  @Column({ type: 'varchar', length: 128, comment: '密码散列（scrypt）' })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 64, comment: '姓名' })
  realName!: string;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '联系电话' })
  phone!: string | null;

  @Column({ type: 'varchar', length: 32, comment: '平台角色' })
  role!: string;

  @Column({
    type: 'varchar',
    length: 16,
    default: AccountStatus.Active,
    comment: '账号状态',
  })
  status!: AccountStatus;
}
