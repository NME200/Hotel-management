import { Column, Entity, Index } from 'typeorm';
import { AccountStatus, StaffRole } from '../../common/constants/dict';
import { TenantBaseEntity } from './base.entity';

@Entity('merchant_staff', {
  comment: '商户员工账号，登录名在商户内唯一',
})
@Index(['merchantId', 'username'], { unique: true })
@Index(['merchantId', 'status'])
export class MerchantStaff extends TenantBaseEntity {
  @Column({ type: 'varchar', length: 64, comment: '登录账号' })
  username!: string;

  @Column({ type: 'varchar', length: 128, comment: '密码散列（scrypt）' })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 64, comment: '姓名' })
  realName!: string;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '手机号' })
  phone!: string | null;

  @Column({ type: 'varchar', length: 16, comment: '角色' })
  role!: StaffRole;

  @Column({
    type: 'varchar',
    length: 16,
    default: AccountStatus.Active,
    comment: '账号状态',
  })
  status!: AccountStatus;

  @Column({ type: 'datetime', nullable: true, comment: '最近登录时间' })
  lastLoginAt!: Date | null;
}
