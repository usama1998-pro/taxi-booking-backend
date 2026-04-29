import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const SWAGGER_PATH = 'docs';

export function getSwaggerPath(): string {
  return SWAGGER_PATH;
}

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Taxi Booking API')
    .setDescription('HTTP API for the taxi booking backend')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        bearerFormat: 'JWT',
        description:
          'Click Authorize, then paste only the access_token from POST /auth/signin or /auth/signup (Swagger adds the Bearer prefix; do not paste Bearer yourself).',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}
