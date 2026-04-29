import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let database: { ping: jest.Mock };

  beforeEach(async () => {
    database = { ping: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DatabaseService, useValue: database }],
    }).compile();

    controller = module.get(HealthController);
  });

  it('returns ok when database ping succeeds', async () => {
    database.ping.mockResolvedValue(undefined);
    await expect(controller.checkDatabase()).resolves.toEqual({
      status: 'ok',
      database: { status: 'up' },
    });
  });

  it('throws ServiceUnavailableException when database ping fails', async () => {
    database.ping.mockRejectedValue(new Error('connect ECONNREFUSED'));
    await expect(controller.checkDatabase()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
