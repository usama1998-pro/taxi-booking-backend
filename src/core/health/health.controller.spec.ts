import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: { ping: jest.Mock };

  beforeEach(async () => {
    prisma = { ping: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    controller = module.get(HealthController);
  });

  it('returns ok when database ping succeeds', async () => {
    prisma.ping.mockResolvedValue(undefined);
    await expect(controller.checkDatabase()).resolves.toEqual({
      status: 'ok',
      database: { status: 'up' },
    });
  });

  it('throws ServiceUnavailableException when database ping fails', async () => {
    prisma.ping.mockRejectedValue(new Error('connect ECONNREFUSED'));
    await expect(controller.checkDatabase()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
