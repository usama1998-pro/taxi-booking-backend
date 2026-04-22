import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import {
  getSwaggerPath,
  setupSwagger,
} from './../src/core/swagger/setup-swagger';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setupSwagger(app);
    await app.init();
  });

  it('/ (GET) redirects to Swagger docs', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(302)
      .expect('Location', `/${getSwaggerPath()}`);
  });

  it('/docs (GET) serves Swagger UI', () => {
    return request(app.getHttpServer()).get('/docs').expect(200);
  });
});
