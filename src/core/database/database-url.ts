import * as fs from 'node:fs';

/**
 * TCP URL for `pg` and `@prisma/adapter-pg`. Prisma Accelerate URLs (`prisma+postgres://…`)
 * are not valid here; use `DATABASE_DIRECT_URL` or discrete `DATABASE_*` vars for Docker/local.
 */
function isDirectPostgresUrl(url: string): boolean {
  return /^postgres(ql)?:\/\//i.test(url);
}

/**
 * Compose service hostname `postgres` only resolves on the Docker network.
 * Nest on the host (Windows/macOS/Linux) must use `localhost` + the published host port.
 */
function resolvedDatabaseHost(configured: string | undefined): string {
  const host = (configured ?? 'localhost').trim() || 'localhost';
  if (host !== 'postgres') {
    return host;
  }
  if (process.platform === 'win32') {
    return 'localhost';
  }
  try {
    if (fs.existsSync('/.dockerenv')) {
      return 'postgres';
    }
  } catch {
    // ignore
  }
  return 'localhost';
}

export function getDatabaseUrl(): string {
  const direct =
    process.env.DATABASE_DIRECT_URL?.trim() ?? process.env.DIRECT_URL?.trim();

  if (direct && isDirectPostgresUrl(direct)) {
    return direct;
  }

  const url = process.env.DATABASE_URL?.trim();
  if (url && isDirectPostgresUrl(url)) {
    return url;
  }

  const host = resolvedDatabaseHost(process.env.DATABASE_HOST);
  const port = process.env.DATABASE_PORT ?? '5432';
  const user = process.env.DATABASE_USER;
  const password = process.env.DATABASE_PASSWORD;
  const database = process.env.DATABASE_NAME;

  if (!user || password === undefined || !database) {
    throw new Error(
      'Missing database configuration: set a direct postgresql:// URL (DATABASE_URL, DATABASE_DIRECT_URL, or DIRECT_URL), or DATABASE_USER, DATABASE_PASSWORD, DATABASE_NAME (and optionally DATABASE_HOST, DATABASE_PORT). Prisma Accelerate URLs (prisma+postgres://) cannot be used with the pg driver; use discrete vars or DATABASE_DIRECT_URL for TCP.',
    );
  }

  const enc = encodeURIComponent;
  return `postgresql://${enc(user)}:${enc(password)}@${host}:${port}/${enc(database)}`;
}
