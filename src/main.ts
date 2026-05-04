import 'dotenv/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getSwaggerPath, setupSwagger } from './core/swagger/setup-swagger';

const DEFAULT_CORS_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function buildCorsOriginSet(): Set<string> {
  const set = new Set(DEFAULT_CORS_ORIGINS);
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) {
    return set;
  }
  for (const part of raw.split(',')) {
    const o = part.trim().replace(/\/$/, '');
    if (o.length > 0) {
      set.add(o);
    }
  }
  return set;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const corsOrigins = buildCorsOriginSet();
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (corsOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
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
  Logger.log(`Listening on http://${host}:${port}`, 'Bootstrap');
  Logger.log(`Backend (e.g. browser): ${base}`, 'Bootstrap');
  Logger.log(`Swagger: ${base}/${docsPath}`, 'Bootstrap');
  Logger.log(`CORS: ${corsOrigins.size} allowed origin(s)`, 'Bootstrap');
}
void bootstrap();
