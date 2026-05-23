import './bootstrap-env';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createApplicationLogger } from './core/logger/nest-winston.logger';
import { getSwaggerPath, setupSwagger } from './core/swagger/setup-swagger';

async function bootstrap() {
  const logger = createApplicationLogger();
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger,
  });
  app.useLogger(logger);
  app.enableShutdownHooks();
  // Reflects the request `Origin` — any website can call this API from the browser.
  // (Using `origin: '*'` would break `credentials: true`.)
  app.enableCors({
    origin: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
    ],
    credentials: true,
    maxAge: 86_400,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  setupSwagger(app);

  const port = Number(process.env.PORT ?? 3000);
  /** Bind all interfaces so phones/emulators on the LAN can reach the API (not loopback-only). */
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);

  const base =
    process.env.APP_URL?.replace(/\/$/, '') ?? `http://localhost:${port}`;
  const docsPath = getSwaggerPath();
  logger.log(`Process timezone: ${process.env.TZ}`, 'Bootstrap');
  logger.log(`Listening on http://${host}:${port}`, 'Bootstrap');
  logger.log(`Backend (e.g. browser): ${base}`, 'Bootstrap');
  logger.log(`Swagger: ${base}/${docsPath}`, 'Bootstrap');
  logger.log('CORS: all origins allowed (reflect request Origin)', 'Bootstrap');
}
void bootstrap();
