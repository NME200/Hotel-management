import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { Public } from '../../common/decorators/public.decorator';
import type { ConfigRoot } from '../../config/configuration';
import { PlatformUser } from '../../database/entities/platform-user.entity';
import { RedisService } from '../redis/redis.service';

interface LivenessReport {
  status: 'ok';
  uptimeSeconds: number;
}

interface ReadinessReport {
  status: 'ok' | 'degraded';
  env: string;
  database: boolean;
  redis: boolean;
  accountCount: number;
  uptimeSeconds: number;
}

/**
 * 健康检查分成语义不同的探针，这是容器编排的硬要求：
 *
 * - `live` 只回答「进程还活着吗」，**刻意不查任何外部依赖**。
 *   若它去查数据库，数据库抖动时编排器会误判进程已死、反复重启容器，
 *   把一次短暂故障放大成持续不可用。
 * - `ready` 回答「现在能接流量吗」，查数据库与 Redis，未就绪返回 503，
 *   负载均衡据此把副本摘除（摘除 ≠ 重启，进程本身仍是健康的）。
 * - 无路径的 `/health` 保留给人工与旧脚本使用，**始终返回 200**，
 *   靠 body 里的 `status` 字段表达健康度，不因依赖故障改变状态码。
 *
 * 探针会被编排器高频调用，因此整体跳过限流，避免把探针打成 429 导致误判。
 */
@ApiTags('健康检查')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    private readonly configService: ConfigService<ConfigRoot, true>,
  ) {}

  @Public()
  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '存活探针：只表示进程在运行，不检查任何依赖' })
  live(): LivenessReport {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: '就绪探针：数据库与 Redis 均连通才返回 200，否则 503' })
  async ready(): Promise<ReadinessReport> {
    const report = await this.inspect();
    if (report.status !== 'ok') {
      throw new ServiceUnavailableException(
        `依赖未就绪：database=${report.database} redis=${report.redis}`,
      );
    }
    return report;
  }

  @Public()
  @Get()
  @ApiOperation({ summary: '健康检查（人工/脚本用，始终 200，健康度看 body.status）' })
  check(): Promise<ReadinessReport> {
    return this.inspect();
  }

  private async inspect(): Promise<ReadinessReport> {
    const env = this.configService.get('app', { infer: true }).env;
    let databaseOk = false;
    let accountCount = 0;

    if (this.dataSource.isInitialized) {
      accountCount = await this.dataSource.getRepository(PlatformUser).count();
      databaseOk = true;
    }

    const redisOk = await this.redis.ping();

    return {
      status: databaseOk && redisOk ? 'ok' : 'degraded',
      env,
      database: databaseOk,
      redis: redisOk,
      accountCount,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
