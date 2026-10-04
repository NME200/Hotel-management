import { In, type EntityManager } from 'typeorm';
import { TenantRepo } from '../../../common/repository/tenant.repo';
import { Dish } from '../../../database/entities/dish.entity';
import { DishSku } from '../../../database/entities/dish-sku.entity';
import { readStockPlan, type StockPlan } from './client-order-price.service';

/**
 * 按算价阶段产出的库存计划扣减库存。
 *
 * 抽成独立函数是因为它有两个调用方：顾客自助下单与收银台线下点餐。
 * 扣库存算错会直接导致超卖，这种逻辑不该有第二份实现。
 *
 * 必须在与订单落库同一个事务里调用（传入事务的 EntityManager），
 * 否则会出现「订单建了但库存没扣」或反之。
 */
export async function deductStock(
  manager: EntityManager,
  merchantId: number,
  plan: StockPlan,
): Promise<void> {
  const { dishIds, skuIds } = readStockPlan(plan);
  const dishes = new TenantRepo(manager.getRepository(Dish));
  const skus = new TenantRepo(manager.getRepository(DishSku));

  if (dishIds.length) {
    const rows = await dishes.list(merchantId, { where: { id: In(dishIds) } });
    for (const dish of rows) {
      const take = plan.get(dish.id) ?? 0;
      if (take > 0 && dish.stock !== null) {
        dish.stock = Math.max(dish.stock - take, 0);
      }
    }
    await manager.getRepository(Dish).save(rows);
  }

  if (skuIds.length) {
    const rows = await skus.list(merchantId, { where: { id: In(skuIds) } });
    for (const sku of rows) {
      const take = plan.get(-sku.id - 1) ?? 0;
      if (take > 0 && sku.stock !== null) {
        sku.stock = Math.max(sku.stock - take, 0);
      }
    }
    await manager.getRepository(DishSku).save(rows);
  }
}
