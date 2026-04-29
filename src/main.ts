import 'dotenv/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getSwaggerPath, setupSwagger } from './core/swagger/setup-swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ],
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
  await app.listen(port);

  const base =
    process.env.APP_URL?.replace(/\/$/, '') ?? `http://localhost:${port}`;
  const docsPath = getSwaggerPath();
  Logger.log(`Backend: ${base}`, 'Bootstrap');
  Logger.log(`Swagger: ${base}/${docsPath}`, 'Bootstrap');
}
void bootstrap();
