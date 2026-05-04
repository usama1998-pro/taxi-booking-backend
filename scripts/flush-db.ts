/**
 * Truncates all base tables in the current MySQL database (current `DATABASE()`).
 *
 * Usage:
 *   FLUSH_ALL_CONFIRM=YES_FLUSH npm run db:flush
 */
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
import { getPrismaMariaDbAdapterConfig } from '../src/core/database/database-url';

const REQUIRED_CONFIRMATION = 'YES_FLUSH';

async function main(): Promise<void> {
  const confirmation = process.env.FLUSH_ALL_CONFIRM;
  if (confirmation !== REQUIRED_CONFIRMATION) {
    console.error(
      `Refusing to flush DB. Set FLUSH_ALL_CONFIRM=${REQUIRED_CONFIRMATION} to proceed.`,
    );
    process.exitCode = 1;
    return;
  }

  const adapter = new PrismaMariaDb(getPrismaMariaDbAdapterConfig());
  const prisma = new PrismaClient({ adapter });
  try {
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
    const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT TABLE_NAME AS table_name
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_TYPE = 'BASE TABLE'`,
    );
    for (const { table_name: tableName } of rows) {
      const safe = tableName.replace(/`/g, '``');
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${safe}\``);
    }
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
    console.log('All base tables truncated successfully.');
  } finally {
    await prisma.$disconnect();
  }
}

void main();
