/**
 * Manual super-admin bootstrap (CLI). On API startup the same logic runs via
 * DatabaseBootstrapService when SUPER_ADMIN_* env vars are set.
 *
 * Run: `npm run ensure-super-admin-from-env`
 */
import '../src/bootstrap-env';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
import { getPrismaMariaDbAdapterConfig } from '../src/core/database/database-url';
import {
  ensureSuperAdminFromEnv,
  formatEnsureSuperAdminError,
  readSuperAdminBootstrapFromEnv,
} from '../src/core/database/ensure-super-admin-from-env';

async function main(): Promise<void> {
  let bootstrap;
  try {
    bootstrap = readSuperAdminBootstrapFromEnv();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
    return;
  }

  if (!bootstrap) {
    console.log(
      'ensure-super-admin-from-env: skipped (no SUPER_ADMIN_* env vars).',
    );
    return;
  }

  const adapter = new PrismaMariaDb(getPrismaMariaDbAdapterConfig());
  const prisma = new PrismaClient({ adapter });

  console.log(
    'ensure-super-admin-from-env: checking DB (idempotent — only inserts if this email has no user yet).',
  );

  try {
    const result = await ensureSuperAdminFromEnv(prisma, bootstrap);
    switch (result.status) {
      case 'exists':
        console.log(
          `ensure-super-admin-from-env: super admin already exists (${bootstrap.email}).`,
        );
        break;
      case 'promoted':
        console.log(
          `ensure-super-admin-from-env: promoted existing staff user to super admin (${bootstrap.email}).`,
        );
        break;
      case 'created':
        console.log(
          `ensure-super-admin-from-env: created super admin ${result.userId} (${bootstrap.email}).`,
        );
        break;
      case 'error':
        console.error(`ensure-super-admin-from-env: ${result.message}`);
        process.exitCode = 1;
        break;
      default:
        break;
    }
  } catch (e) {
    console.error(`ensure-super-admin-from-env: ${formatEnsureSuperAdminError(e)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
