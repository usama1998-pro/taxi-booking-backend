import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import { getSwaggerPath } from './swagger/setup-swagger';
import { RootController } from './root.controller';

describe('RootController', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RootController],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('redirects GET / to Swagger UI', () => {
    return request(app.getHttpServer() as Server)
      .get('/')
      .expect(302)
      .expect('Location', `/${getSwaggerPath()}`);
  });
});
