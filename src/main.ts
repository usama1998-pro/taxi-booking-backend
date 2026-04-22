import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getSwaggerPath, setupSwagger } from './core/swagger/setup-swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
