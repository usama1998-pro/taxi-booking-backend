/**
 * Optional migrate before `node dist/main.js`.
 * Set PRISMA_MIGRATE_ON_START=1 on Hostinger when you have new migrations to apply.
 * Uses one CLI connection — run with the API stopped if you are near max_connections_per_hour.
 */
const { execSync } = require('node:child_process');

const raw = process.env.PRISMA_MIGRATE_ON_START?.trim().toLowerCase();
const enabled =
  raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';

if (!enabled) {
  process.exit(0);
}

console.log('PRISMA_MIGRATE_ON_START enabled — running prisma migrate deploy…');
execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
