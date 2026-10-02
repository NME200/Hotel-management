import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformUser } from '../../database/entities/platform-user.entity';
import type { ConfigRoot } from '../../config/configuration';
import { RedisService } from '../redis/redis.service';

interface HealthReport {
  status: 'ok' | 'degraded';
  env: string;
  database: boolean;
  redis: boolean;
  accountCount: number;
  uptimeSeconds: number;
}

@ApiTags('健康检查')
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    private readonly configService: ConfigService<ConfigRoot, true>,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '检查数据库与 Redis 连通性' })
  async check(): Promise<HealthReport> {
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
