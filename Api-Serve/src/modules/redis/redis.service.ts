import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { ConfigRoot } from '../../config/configuration';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly configService: ConfigService<ConfigRoot, true>) {}

  async onModuleInit(): Promise<void> {
    const redis = this.configService.get('app', { infer: true }).redis;
    this.client = new Redis({
      host: redis.host,
      port: redis.port,
      password: redis.password,
      db: redis.db,
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => Math.min(times * 200, 5_000),
    });
    this.client.on('error', (error: Error) => {
      this.logger.error(`Redis 连接异常: ${error.message}`);
    });

    try {
      await this.client.connect();
      this.logger.log(`Redis 已连接 ${redis.host}:${redis.port}/${redis.db}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Redis 初始化失败（请检查 REDIS_* 配置）: ${message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
  }

  getClient(): Redis {
    return this.client;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  /**
   * 按前缀批量清理（SCAN 实现，避免 KEYS 阻塞）。
   */
  async delByPrefix(prefix: string): Promise<void> {
    let cursor = '0';
    do {
      const [next, matched] = await this.client.scan(
        cursor,
        'MATCH',
        `${prefix}*`,
        'COUNT',
        200,
      );
      cursor = next;
      if (matched.length > 0) {
        await this.client.del(...matched);
      }
    } while (cursor !== '0');
  }

  /** 返回计数值，用于登录失败次数等限流场景。 */
  async incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const total = await this.client.incr(key);
    if (total === 1) {
      await this.client.expire(key, ttlSeconds);
    }
    return total;
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  /**
   * 抢占式分布式锁（SET NX EX）。多实例部署时保证定时任务只有一个节点在跑。
   */
  async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async releaseLock(key: string): Promise<void> {
    await this.client.del(key);
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
