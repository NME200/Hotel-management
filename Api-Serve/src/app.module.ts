import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { RequestLogInterceptor } from './common/interceptors/request-log.interceptor';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
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
import { RedisModule } from './modules/redis/redis.module';

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
    AuditModule,
    AuthModule,
    MemberGrowthModule,
    MerchantModule,
    PaymentModule,
    PlatformModule,
    ClientModule,
    HealthModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: RequestLogInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
