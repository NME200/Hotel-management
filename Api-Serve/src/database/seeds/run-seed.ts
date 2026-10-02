import { DineType, MemberLevel, OrderStatus, StoreStatus } from '../../common/constants/dict';
import { generateOrderNo, generatePickupCode } from '../../common/utils/id.util';
import { hashPassword } from '../../common/utils/password.util';
import { Category } from '../entities/category.entity';
import { Dish } from '../entities/dish.entity';
import { DishOptionGroup } from '../entities/dish-option-group.entity';
import { DishSku } from '../entities/dish-sku.entity';
import { Member } from '../entities/member.entity';
import { Merchant } from '../entities/merchant.entity';
import { MerchantStaff } from '../entities/merchant-staff.entity';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { PlatformUser } from '../entities/platform-user.entity';
import { Store } from '../entities/store.entity';
import dataSource from '../data-source';
import {
  MERCHANT_SEEDS,
  PLATFORM_ACCOUNT_SEEDS,
  type DishSeed,
  type MerchantSeed,
} from './demo-data';
import type { EntityManager } from 'typeorm';

/** 固定种子的伪随机，保证每次 seed 出来的演示数据一致，便于对照验证。 */
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length) % items.length];
}

function daysAgo(days: number, random: () => number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(10 + Math.floor(random() * 11), Math.floor(random() * 60), 0, 0);
  return date;
}

function statusForAge(age: number, random: () => number): OrderStatus {
  if (age >= 2) {
    return random() < 0.1 ? OrderStatus.Cancelled : OrderStatus.Completed;
  }
  const roll = random();
  if (roll < 0.25) {
    return OrderStatus.Pending;
  }
  if (roll < 0.45) {
    return OrderStatus.Accepted;
  }
  if (roll < 0.65) {
    return OrderStatus.Preparing;
  }
  if (roll < 0.8) {
    return OrderStatus.Ready;
  }
  return OrderStatus.Completed;
}

async function seedPlatformAccounts(manager: EntityManager): Promise<number> {
  const repository = manager.getRepository(PlatformUser);
  let created = 0;

  for (const account of PLATFORM_ACCOUNT_SEEDS) {
    const exists = await repository.exists({ where: { username: account.username } });
    if (exists) {
      continue;
    }
    await repository.insert({
      username: account.username,
      passwordHash: await hashPassword(account.password),
      realName: account.realName,
      phone: account.phone,
      role: account.role,
    });
    created += 1;
  }

  return created;
}

async function seedMerchant(
  manager: EntityManager,
  seed: MerchantSeed,
): Promise<'skipped' | 'created'> {
  const merchants = manager.getRepository(Merchant);
  const existing = await merchants.findOne({ where: { code: seed.code } });
  if (existing) {
    return 'skipped';
  }

  const merchant = await merchants.save({
    code: seed.code,
    name: seed.name,
    contactName: seed.contactName,
    contactPhone: seed.contactPhone,
    status: 'active',
    expireAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    auditedAt: new Date(),
  });

  const staffRepository = manager.getRepository(MerchantStaff);
  const staffRows: Partial<MerchantStaff>[] = [];
  for (const staff of seed.staffs) {
    staffRows.push({
      merchantId: merchant.id,
      username: staff.username,
      passwordHash: await hashPassword(staff.password),
      realName: staff.realName,
      phone: staff.phone,
      role: staff.role,
    });
  }
  await staffRepository.insert(staffRows);

  await manager.getRepository(Store).insert({
    merchantId: merchant.id,
    ...seed.store,
    status: seed.store.status === StoreStatus.Open ? StoreStatus.Open : StoreStatus.Closed,
  });

  const seededDishes = await seedCategories(manager, merchant.id, seed);
  await seedMembers(manager, merchant.id, seed);
  await seedOrders(manager, merchant.id, seed, seededDishes);

  return 'created';
}

/** 带 ID 的菜品种子，订单快照要引用真实 dishId。 */
interface SeededDish {
  id: number;
  seed: DishSeed;
}

async function seedCategories(
  manager: EntityManager,
  merchantId: number,
  seed: MerchantSeed,
): Promise<SeededDish[]> {
  const seededDishes: SeededDish[] = [];

  for (const categorySeed of seed.categories) {
    const category = await manager.getRepository(Category).insert({
      merchantId,
      name: categorySeed.name,
      sort: categorySeed.sort,
      status: 'enabled',
    });
    const categoryId = category.identifiers[0]?.id as number;

    for (const dishSeed of categorySeed.dishes) {
      const inserted = await manager.getRepository(Dish).insert({
        merchantId,
        categoryId,
        name: dishSeed.name,
        subtitle: dishSeed.subtitle,
        description: dishSeed.subtitle,
        price: dishSeed.price,
        memberPrice: dishSeed.memberPrice,
        unit: dishSeed.unit,
        stockType: 'unlimited',
        stock: null,
        salesCount: dishSeed.salesCount,
        sort: 0,
        isRecommend: dishSeed.isRecommend,
        tags: dishSeed.tags,
        status: 'on_sale',
      });
      const dishId = inserted.identifiers[0]?.id as number;
      seededDishes.push({ id: dishId, seed: dishSeed });

      if (dishSeed.skus?.length) {
        await manager.getRepository(DishSku).insert(
          dishSeed.skus.map((sku, index) => ({
            merchantId,
            dishId,
            name: sku.name,
            price: sku.price,
            specDesc: sku.specDesc,
            sort: index,
          })),
        );
      }

      if (dishSeed.optionGroups?.length) {
        await manager.getRepository(DishOptionGroup).insert(
          dishSeed.optionGroups.map((group, groupIndex) => ({
            merchantId,
            dishId,
            name: group.name,
            type: group.type,
            required: group.required,
            sort: groupIndex,
            options: group.options.map((option, optionIndex) => ({
              name: option.name,
              priceDelta: option.priceDelta,
              sort: optionIndex,
            })),
          })),
        );
      }
    }
  }

  return seededDishes;
}

async function seedMembers(
  manager: EntityManager,
  merchantId: number,
  seed: MerchantSeed,
): Promise<void> {
  await manager.getRepository(Member).insert(
    seed.members.map((member) => ({
      merchantId,
      nickname: member.nickname,
      phone: member.phone,
      gender: member.gender,
      level: member.level,
      points: member.points,
      balance: member.balance,
      totalAmount: 0,
      orderCount: 0,
      status: 'active',
      registerSource: 'mini_program',
    })),
  );
}

async function seedOrders(
  manager: EntityManager,
  merchantId: number,
  seed: MerchantSeed,
  dishes: SeededDish[],
): Promise<void> {
  if (dishes.length === 0) {
    return;
  }

  const random = createRandom(seed.code.length * 7919 + seed.orderCount);
  const members = await manager.getRepository(Member).find({ where: { merchantId } });
  const orderRepository = manager.getRepository(Order);
  const itemRepository = manager.getRepository(OrderItem);

  for (let index = 0; index < seed.orderCount; index += 1) {
    const age = Math.floor(random() * 7);
    const createdAt = daysAgo(age, random);
    const status = statusForAge(age, random);
    const dineType = pick([DineType.DineIn, DineType.DineIn, DineType.Takeout, DineType.Pickup], random);
    const member = random() < 0.65 ? pick(members, random) : null;

    const lines = 1 + Math.floor(random() * 3);
    const items = Array.from({ length: lines }, () => {
      const dish = pick(dishes, random);
      const sku = dish.seed.skus?.length ? pick(dish.seed.skus, random) : null;
      const quantity = 1 + Math.floor(random() * 2);
      const unitPrice = sku?.price ?? dish.seed.price;
      return {
        dish,
        sku,
        quantity,
        unitPrice,
        totalAmount: Number((unitPrice * quantity).toFixed(2)),
      };
    });

    const dishAmount = Number(items.reduce((sum, item) => sum + item.totalAmount, 0).toFixed(2));
    const packingAmount = dineType === DineType.DineIn ? 0 : items.length;
    const deliveryAmount = dineType === DineType.Takeout ? 5 : 0;
    const discountAmount = member && member.level !== MemberLevel.Normal ? 3 : 0;
    const payAmount = Number((dishAmount + packingAmount + deliveryAmount - discountAmount).toFixed(2));

    const order = await orderRepository.save({
      merchantId,
      orderNo: generateOrderNo(createdAt),
      pickupCode: generatePickupCode(),
      memberId: member?.id ?? null,
      memberNickname: member?.nickname ?? null,
      dineType,
      status,
      tableNo: dineType === DineType.DineIn ? `${1 + Math.floor(random() * 12)} 号桌` : null,
      peopleCount: 1 + Math.floor(random() * 4),
      dishAmount,
      packingAmount,
      deliveryAmount,
      discountAmount,
      payAmount,
      remark: random() < 0.3 ? '少油少盐' : null,
      acceptedAt: status === OrderStatus.Pending ? null : createdAt,
      completedAt: status === OrderStatus.Completed ? createdAt : null,
      cancelledAt: status === OrderStatus.Cancelled ? createdAt : null,
      cancelReason: status === OrderStatus.Cancelled ? '顾客主动取消' : null,
      createdAt,
    });

    await itemRepository.insert(
      items.map((item) => ({
        merchantId,
        orderId: order.id,
        dishId: item.dish.id,
        dishName: item.dish.seed.name,
        dishImage: null,
        skuId: null,
        specDesc: item.sku?.name ?? null,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        totalAmount: item.totalAmount,
        remark: null,
      })),
    );
  }
}

async function run(): Promise<void> {
  await dataSource.initialize();

  try {
    const result = await dataSource.transaction(async (manager) => {
      const accounts = await seedPlatformAccounts(manager);
      let merchantsCreated = 0;
      let merchantsSkipped = 0;

      for (const seed of MERCHANT_SEEDS) {
        const outcome = await seedMerchant(manager, seed);
        if (outcome === 'created') {
          merchantsCreated += 1;
        } else {
          merchantsSkipped += 1;
        }
      }

      return { accounts, merchantsCreated, merchantsSkipped };
    });

    console.log(
      `种子数据完成：新增平台账号 ${result.accounts} 个，新增商户 ${result.merchantsCreated} 个，跳过已存在商户 ${result.merchantsSkipped} 个。`,
    );
    console.log('平台端登录：POST /api/v1/auth/platform/login  admin / Admin@123456');
    console.log('商家端登录：POST /api/v1/auth/merchant/login  M10001 + boss / Boss@123456');
    console.log('隔离验证商户：M10002 + boss / Boss@123456');
  } finally {
    await dataSource.destroy();
  }
}

run().catch((error: unknown) => {
  console.error('种子数据失败：', error instanceof Error ? error.message : error);
  process.exit(1);
});
