import { Activity } from './activity.entity';
import { Category } from './category.entity';
import { CouponTemplate } from './coupon-template.entity';
import { Dish } from './dish.entity';
import { DishOptionGroup } from './dish-option-group.entity';
import { DishSku } from './dish-sku.entity';
import { Member } from './member.entity';
import { MemberCoupon } from './member-coupon.entity';
import { Merchant } from './merchant.entity';
import { MerchantPaymentConfig } from './merchant-payment-config.entity';
import { MerchantStaff } from './merchant-staff.entity';
import { MiniProgramConfig } from './mini-program-config.entity';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { Payment } from './payment.entity';
import { PaymentChannelConfig } from './payment-channel-config.entity';
import { PaymentNotifyLog } from './payment-notify-log.entity';
import { PaymentReconcile } from './payment-reconcile.entity';
import { PaymentReconcileDetail } from './payment-reconcile-detail.entity';
import { PaymentRefund } from './payment-refund.entity';
import { PlatformAudit } from './platform-audit.entity';
import { PlatformUser } from './platform-user.entity';
import { ProfitShare } from './profit-share.entity';
import { Promotion } from './promotion.entity';
import { Store } from './store.entity';

export {
  Activity,
  Category,
  CouponTemplate,
  Dish,
  DishOptionGroup,
  DishSku,
  Member,
  MemberCoupon,
  Merchant,
  MerchantPaymentConfig,
  MerchantStaff,
  MiniProgramConfig,
  Order,
  OrderItem,
  Payment,
  PaymentChannelConfig,
  PaymentNotifyLog,
  PaymentReconcile,
  PaymentReconcileDetail,
  PaymentRefund,
  PlatformAudit,
  PlatformUser,
  ProfitShare,
  Promotion,
  Store,
};
export { BaseEntity, TenantBaseEntity } from './base.entity';
export { DishOptionItem } from './dish-option-group.entity';

export const entities = [
  Activity,
  PlatformUser,
  PlatformAudit,
  MiniProgramConfig,
  Merchant,
  MerchantStaff,
  Store,
  Category,
  Dish,
  DishSku,
  DishOptionGroup,
  Member,
  Order,
  OrderItem,
  CouponTemplate,
  MemberCoupon,
  Payment,
  PaymentRefund,
  PaymentNotifyLog,
  PaymentChannelConfig,
  MerchantPaymentConfig,
  ProfitShare,
  PaymentReconcile,
  PaymentReconcileDetail,
  Promotion,
];
