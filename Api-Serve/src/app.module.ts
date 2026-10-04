import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { RequestLogInterceptor } from './common/interceptors/request-log.interceptor';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { isAuthRequest } from './common/throttler/throttler.util';
import { SnakeNamingStrategy } from './database/naming-strategy';
import { entities } from './database/entities';
import { configuration, type ConfigRoot } from './config/configuration';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClientModule } from './modules/client/client.module';
import { HealthModule } from './modules/health/health.module';
import { MemberGrowthModule } from './modules/member-growth/member-growth.module';
import { MerchantModule } from './modules/merchant/merchant.module';
import { PaymentModule } from './modules/payment/payment.module';
import { PlatformModule } from './modules/platform/platform.module';
import { PrintProviderModule } from './modules/print-provider/print-provider.module';
import { SmsModule } from './modules/sms/sms.module';
import { RedisModule } from './modules/redis/redis.module';
import { RedisService } from './modules/redis/redis.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<ConfigRoot, true>) => {
        const { database, debug } = configService.get('app', { infer: true });
        return {
          type: 'mysql' as const,
          host: database.host,
          port: database.port,
          username: database.username,
          password: database.password,
          database: database.database,
          charset: 'utf8mb4',
          timezone: 'local',
          entities,
          migrations: [`${__dirname}/database/migrations/*.{ts,js}`],
          migrationsRun: false,
          namingStrategy: new SnakeNamingStrategy(),
          synchronize: false,
          logging: debug ? (['error', 'warn', 'migration'] as const) : (['error'] as const),
          extra: { connectionLimit: database.poolSize },
        };
      },
    }),
    RedisModule,
    /**
     * 限流：`default` 管所有接口，`auth` 只对登录/换令牌生效且额度严得多。
     *
     * 两个节流器会叠加判定，所以 auth 路由实际取的是「更严的那个」——
     * 不必给每个登录方法挂装饰器，也就不会出现「新加了登录接口忘了加限流」。
     */
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, RedisService],
      useFactory: (configService: ConfigService<ConfigRoot, true>, redis: RedisService) => {
        const throttle = configService.get('app', { infer: true }).throttle;
        return {
          throttlers: [
            {
              name: 'default',
              ttl: throttle.ttlMs,
              limit: throttle.limit,
              // 超限后封禁一整个窗口，避免在窗口边界用「超一点点」的方式持续试探
              blockDuration: throttle.ttlMs,
            },
            {
              name: 'auth',
              ttl: throttle.ttlMs,
              limit: throttle.loginLimit,
              blockDuration: throttle.ttlMs,
              skipIf: (context) => !isAuthRequest(context),
            },
          ],
          storage: new RedisThrottlerStorage(redis),
          errorMessage: '请求过于频繁，请稍后再试',
        };
      },
    }),
    AuditModule,
    AuthModule,
    MemberGrowthModule,
    MerchantModule,
    PaymentModule,
    PrintProviderModule,
    // 短信验证码：平台端配置 + 顾客端发码/校验，凭据与云打印厂商同级
    SmsModule,
    PlatformModule,
    ClientModule,
    HealthModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    // 限流排在最前：被刷的请求在进入鉴权与业务之前就挡掉，省下后面的开销
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: RequestLogInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
