import { Injectable, Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from '../../modules/redis/redis.service';

/**
 * 从接口自身推导返回类型。
 *
 * `ThrottlerStorageRecord` 并没有从包入口导出（只在内部文件里），
 * 与其写 `@nestjs/throttler/dist/...` 这种会随版本失效的深层路径，
 * 不如直接从 increment 的返回值推导。
 */
type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/**
 * 计数与封禁必须在一次往返里完成：分成 INCR 再判断再 SET 三步的话，
 * 两个并发请求会各自读到「未超限」而双双放行，限流在临界点上直接失效。
 * 所以这里用一段 Lua 脚本让 Redis 单线程原子执行。
 *
 * 返回数组含义：[totalHits, timeToExpire(ms), isBlocked(0/1), timeToBlockExpire(ms)]
 */
const INCREMENT_SCRIPT = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

-- 已在封禁窗口内：只回报剩余封禁时间，不再累加计数
local blockTtl = redis.call('PTTL', blockKey)
if blockTtl > 0 then
  local blockedHits = tonumber(redis.call('GET', hitsKey) or '0')
  return { blockedHits, -1, 1, blockTtl }
end

local totalHits = redis.call('INCR', hitsKey)
if totalHits == 1 then
  redis.call('PEXPIRE', hitsKey, ttl)
end

local timeToExpire = redis.call('PTTL', hitsKey)
if timeToExpire < 0 then
  timeToExpire = ttl
end

if totalHits > limit and blockDuration > 0 then
  redis.call('SET', blockKey, '1', 'PX', blockDuration)
  return { totalHits, timeToExpire, 1, blockDuration }
end

return { totalHits, timeToExpire, 0, 0 }
`;

/**
 * 基于 Redis 的限流存储。
 *
 * 用进程内存存计数在多实例（云托管常态）下等于没限流——每个副本各算各的，
 * 攻击者只要命中不同实例就能把配额翻倍。放到 Redis 才能让所有副本共享同一份计数。
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `throttle:${throttlerName}:${key}:hits`;
    const blockKey = `throttle:${throttlerName}:${key}:blocked`;

    try {
      const raw = (await this.redis
        .getClient()
        .eval(INCREMENT_SCRIPT, 2, hitsKey, blockKey, ttl, limit, blockDuration)) as number[];

      return {
        totalHits: Number(raw[0]),
        timeToExpire: Math.ceil(Number(raw[1]) / 1000),
        isBlocked: Number(raw[2]) === 1,
        timeToBlockExpire: Math.ceil(Number(raw[3]) / 1000),
      };
    } catch (error) {
      // 放行而不是抛错：Redis 抖动不该把整个 API 变成 429/500。
      // 应用启动时已强依赖 Redis，能走到这里说明是运行期短暂故障，记一笔即可。
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`限流计数失败，本次请求按放行处理: ${message}`);
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
