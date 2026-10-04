import { ForbiddenException, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
// 先把 .env 灌进 process.env，这样下面能在建应用之前就判断出环境。
// 不能等 ConfigModule：它是在 NestFactory.create 内部才加载 .env 的。
import 'dotenv/config';
import helmet from 'helmet';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import type { ConfigRoot } from './config/configuration';
import { createHostFilter } from './common/middleware/host-filter';
import { JsonLogger } from './common/logger/json.logger';

const isProductionEnv = (process.env.APP_ENV ?? '').trim() === 'production';

async function bootstrap(): Promise<void> {
  // rawBody: 支付渠道回调必须用原始报文验签，JSON 重新序列化会导致验签必然失败
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    /**
     * 生产日志器必须在**建应用之前**就交给 Nest。
     *
     * 早先是先 create({ bufferLogs: true }) 再 app.useLogger(JsonLogger)，
     * 结果一旦启动阶段卡住或失败（例如配置指向了不存在的数据库域名），
     * 缓冲的日志永远等不到那次切换，生产上表现为「进程活着、端口不监听、一行日志都没有」，
     * 完全没有排查线索。直接传 logger 就能让启动全过程都有日志。
     */
    ...(isProductionEnv ? { logger: new JsonLogger('Api-Serve') } : {}),
  });
  const config = app
    .get<ConfigService<ConfigRoot, true>>(ConfigService)
    .get('app', { infer: true });

  /**
   * 必须早于任何读取 req.ip 的逻辑（限流、审计）。
   * 不配的话，部署在 Nginx / 云负载均衡后面时所有请求的 req.ip 都是代理地址，
   * 限流会退化成「全站共享一个桶」，一次异常流量就能把正常用户一起拦掉。
   */
  app.set('trust proxy', config.trustProxy);

  /**
   * 商户上传的图片。挂在 api/v1 之外，走的是 express 的静态中间件，
   * 因此不经过全局守卫——一个只有图片二进制、按随机文件名寻址的只读入口。
   *
   * 只有本地磁盘驱动才挂这一层；用对象存储时图片不在本机，
   * 该路径应由网关/CDN 直接指向存储桶，请求根本到不了应用。
   */
  if (config.upload.driver === 'local') {
    app.useStaticAssets(resolve(config.upload.dir), { prefix: '/uploads/' });
  }

  app.use(
    helmet({
      contentSecurityPolicy: config.isProduction ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(createHostFilter(config.allowedHosts));

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // 小程序、服务端调用不带 Origin，属于同源之外的合法调用方
      if (!origin) {
        callback(null, true);
        return;
      }
      if (config.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      // 开发环境放行本机任意端口，前端换端口不必反复改 .env
      if (
        !config.isProduction &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(
        new ForbiddenException(`未被 ALLOWED_ORIGINS 允许的来源: ${origin}`),
      );
    },
    credentials: true,
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (!config.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('点餐 SaaS Api-Serve')
        .setDescription('平台端 / 商家端 / 小程序共用的接口定义')
        .setVersion('1.0.0')
        .addBearerAuth(
          { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
          'bearer',
        )
        .build(),
    );
    SwaggerModule.setup('docs', app, document, { swaggerOptions: { persistAuthorization: true } });
  }

  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');

  /**
   * 启动时把「实际连到了哪里」打出来。
   *
   * 生产最典型的翻车是配置指向了错误的环境（占位符没替换、PROD_* 覆盖了基础值），
   * 表现为「服务起得来但数据不对」，排查成本极高。这里只打目标不含口令，
   * 一眼就能确认连的是不是预期的库。
   */
  new Logger('Bootstrap').log(
    `Api-Serve 已启动 | 环境=${config.env} 端口=${config.port} ` +
      `| 数据库=${config.database.host}:${config.database.port}/${config.database.database} ` +
      `| Redis=${config.redis.host}:${config.redis.port}/${config.redis.db} ` +
      `| 图片存储=${config.upload.driver} | 信任代理=${String(config.trustProxy)} ` +
      `| 接口文档=${config.isProduction ? '关闭' : '/docs'}`,
  );
}

void bootstrap();
