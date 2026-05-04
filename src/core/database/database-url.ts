import * as fs from 'node:fs';

/**
 * Direct TCP URL for Prisma (`mysql://`) and related tooling.
 * The `mariadb` npm driver only parses `mariadb://` — use `getMariaDbDriverUrl()` for pools.
 * Prisma Accelerate URLs (`prisma+…`) are not valid for the MariaDB driver; use
 * `DATABASE_DIRECT_URL` or discrete `DATABASE_*` vars for Docker/local.
 */
function isDirectMysqlFamilyUrl(url: string): boolean {
  return /^mysql:\/\//i.test(url) || /^mariadb:\/\//i.test(url);
}

/** Prisma Migrate / datasource expect `mysql://`; env may use either scheme. */
function normalizeToPrismaMysqlUrl(url: string): string {
  return url.trim().replace(/^mariadb:\/\//i, 'mysql://');
}

/**
 * Compose service hostname `mysql` only resolves on the Docker network.
 * Nest on the host (Windows/macOS/Linux) must use `localhost` + the published host port.
 */
function resolvedDatabaseHost(configured: string | undefined): string {
  const host = (configured ?? 'localhost').trim() || 'localhost';
  if (host !== 'mysql') {
    return host;
  }
  if (process.platform === 'win32') {
    return 'localhost';
  }
  try {
    if (fs.existsSync('/.dockerenv')) {
      return 'mysql';
    }
  } catch {
    // ignore
  }
  return 'localhost';
}

export function getDatabaseUrl(): string {
  const direct =
    process.env.DATABASE_DIRECT_URL?.trim() ?? process.env.DIRECT_URL?.trim();

  if (direct && isDirectMysqlFamilyUrl(direct)) {
    return normalizeToPrismaMysqlUrl(direct);
  }

  const url = process.env.DATABASE_URL?.trim();
  if (url && isDirectMysqlFamilyUrl(url)) {
    return normalizeToPrismaMysqlUrl(url);
  }

  const host = resolvedDatabaseHost(process.env.DATABASE_HOST);
  const port = process.env.DATABASE_PORT ?? '3306';
  const user = process.env.DATABASE_USER;
  const password = process.env.DATABASE_PASSWORD;
  const database = process.env.DATABASE_NAME;

  if (!user || password === undefined || !database) {
    throw new Error(
      'Missing database configuration: set a direct mysql:// URL (DATABASE_URL, DATABASE_DIRECT_URL, or DIRECT_URL), or DATABASE_USER, DATABASE_PASSWORD, DATABASE_NAME (and optionally DATABASE_HOST, DATABASE_PORT). Prisma Accelerate URLs cannot be used with the MariaDB driver; use discrete vars or DATABASE_DIRECT_URL for TCP.',
    );
  }

  const enc = encodeURIComponent;
  return `mysql://${enc(user)}:${enc(password)}@${host}:${port}/${enc(database)}`;
}

/**
 * Connection string for `mariadb.createPool()` / the native connector (requires `mariadb://`, not `mysql://`).
 */
export function getMariaDbDriverUrl(): string {
  return getDatabaseUrl().replace(/^mysql:\/\//i, 'mariadb://');
}
