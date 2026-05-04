import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as mariadb from 'mariadb';
import { getMariaDbDriverUrl } from './database-url';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: mariadb.Pool | null = null;

  onModuleInit(): void {
    this.pool = mariadb.createPool(getMariaDbDriverUrl());
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
    let conn: mariadb.PoolConnection | undefined;
    try {
      conn = await this.pool.getConnection();
      await conn.query('SELECT 1');
    } finally {
      conn?.release();
    }
  }
}
