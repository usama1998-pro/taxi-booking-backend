/**
 * Truncates ALL tables in ALL non-system PostgreSQL schemas.
 *
 * Usage:
 *   FLUSH_ALL_CONFIRM=YES_FLUSH npm run db:flush
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { getDatabaseUrl } from '../src/core/database/database-url';

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

  const pool = new Pool({ connectionString: getDatabaseUrl() });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  try {
    await prisma.$executeRawUnsafe(`
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      AND schemaname NOT LIKE 'pg_toast%'
  LOOP
    EXECUTE format(
      'TRUNCATE TABLE %I.%I RESTART IDENTITY CASCADE',
      rec.schemaname,
      rec.tablename
    );
  END LOOP;
END $$;
`);
    console.log('All non-system schema tables truncated successfully.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main();
