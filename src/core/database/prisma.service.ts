import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
import { getPrismaMariaDbAdapterConfig } from './database-url';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private activeRequestCount = 0;
  private connected = false;
  private lifecycleLock: Promise<void> = Promise.resolve();

  constructor() {
    const adapter = new PrismaMariaDb(getPrismaMariaDbAdapterConfig());
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    // Connection lifecycle is managed per request by PrismaRequestLifecycleInterceptor.
  }

  async onModuleDestroy(): Promise<void> {
    await this.withLifecycleLock(async () => {
      this.activeRequestCount = 0;
      if (this.connected) {
        await this.$disconnect();
        this.connected = false;
      }
    });
  }

  /** Connectivity check; the driver returns the connection to the pool when this settles. */
  async ping(): Promise<void> {
    await this.$queryRawUnsafe('SELECT 1');
  }

  async acquireRequestConnection(): Promise<void> {
    await this.withLifecycleLock(async () => {
      this.activeRequestCount += 1;
      if (this.activeRequestCount === 1 && !this.connected) {
        await this.$connect();
        this.connected = true;
      }
    });
  }

  async releaseRequestConnection(): Promise<void> {
    await this.withLifecycleLock(async () => {
      if (this.activeRequestCount <= 0) {
        return;
      }
      this.activeRequestCount -= 1;
      if (this.activeRequestCount === 0 && this.connected) {
        await this.$disconnect();
        this.connected = false;
      }
    });
  }

  private async withLifecycleLock(task: () => Promise<void>): Promise<void> {
    const next = this.lifecycleLock.then(task, task);
    this.lifecycleLock = next.catch(() => undefined);
    return next;
  }
}
