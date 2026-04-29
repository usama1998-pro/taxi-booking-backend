import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool, type PoolConfig } from 'pg';
import { getDatabaseUrl } from './database-url';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool | null = null;

  onModuleInit(): void {
    this.pool = new Pool(this.buildPoolConfig());
    this.pool.on('error', (err: Error) => {
      this.logger.error(`PostgreSQL pool error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async ping(): Promise<void> {
    if (!this.pool) {
      throw new Error('Database pool is not initialized');
    }
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  }

  private buildPoolConfig(): PoolConfig {
    return { connectionString: getDatabaseUrl() };
  }
}
