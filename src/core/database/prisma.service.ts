import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
import {
  getPrismaMariaDbAdapterConfig,
  shouldDisconnectDatabaseOnIdle,
} from './database-url';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private activeRequestCount = 0;
  private connected = false;
  private lifecycleLock: Promise<void> = Promise.resolve();
  private readonly disconnectOnIdle = shouldDisconnectDatabaseOnIdle();

  constructor() {
    const adapter = new PrismaMariaDb(getPrismaMariaDbAdapterConfig());
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    if (!this.disconnectOnIdle) {
      await this.ensureConnected();
    }
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
      if (!this.connected) {
        await this.ensureConnected();
      }
    });
  }

  async releaseRequestConnection(): Promise<void> {
    await this.withLifecycleLock(async () => {
      if (this.activeRequestCount <= 0) {
        return;
      }
      this.activeRequestCount -= 1;
      if (this.disconnectOnIdle && this.activeRequestCount === 0 && this.connected) {
        await this.$disconnect();
        this.connected = false;
      }
    });
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.$connect();
      this.connected = true;
    }
  }

  private async withLifecycleLock(task: () => Promise<void>): Promise<void> {
    const next = this.lifecycleLock.then(task, task);
    this.lifecycleLock = next.catch(() => undefined);
    return next;
  }
}
