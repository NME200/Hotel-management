import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { ConfigRoot } from './config/configuration';
import { createHostFilter } from './common/middleware/host-filter';

async function bootstrap(): Promise<void> {
  // rawBody: 支付渠道回调必须用原始报文验签，JSON 重新序列化会导致验签必然失败
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  const config = app
    .get<ConfigService<ConfigRoot, true>>(ConfigService)
    .get('app', { infer: true });

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
  const baseUrl = `http://localhost:${config.port}/api/v1`;
  // eslint-disable-next-line no-console
  console.log(`Api-Serve 已启动: ${baseUrl}  环境=${config.env}  文档=${config.isProduction ? '关闭' : '/docs'}`);
}

void bootstrap();
