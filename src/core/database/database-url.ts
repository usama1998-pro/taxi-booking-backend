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
 * MariaDB connector pool size via URI (helps shared hosts with `max_connections_per_hour`).
 * Set `DATABASE_POOL_CONNECTION_LIMIT=2` (or `1`) on Hostinger-style plans if needed.
 */
function applyPoolConnectionLimit(url: string): string {
  const limit = process.env.DATABASE_POOL_CONNECTION_LIMIT?.trim();
  if (!limit || !/^\d+$/.test(limit)) {
    return url;
  }
  if (/[?&]connectionLimit=/i.test(url)) {
    return url;
  }
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}connectionLimit=${limit}`;
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
    return applyPoolConnectionLimit(normalizeToPrismaMysqlUrl(direct));
  }

  const url = process.env.DATABASE_URL?.trim();
  if (url && isDirectMysqlFamilyUrl(url)) {
    return applyPoolConnectionLimit(normalizeToPrismaMysqlUrl(url));
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
  return applyPoolConnectionLimit(
    `mysql://${enc(user)}:${enc(password)}@${host}:${port}/${enc(database)}`,
  );
}

/**
 * Connection string for `mariadb.createPool()` / the native connector (requires `mariadb://`, not `mysql://`).
 */
export function getMariaDbDriverUrl(): string {
  return getDatabaseUrl().replace(/^mysql:\/\//i, 'mariadb://');
}

/**
 * URL for `prisma.config.ts` only. On CI/build hosts that run `prisma generate` without DB
 * secrets, set `PRISMA_BUILD_SCHEMA_ONLY=1` to use a placeholder (Prisma does not connect for generate).
 * Do **not** use that flag when running `prisma migrate` / `db push` against a real database.
 */
export function getPrismaConfigDatasourceUrl(): string {
  if (process.env.PRISMA_BUILD_SCHEMA_ONLY === '1') {
    return 'mysql://prisma:prisma@127.0.0.1:3306/_prisma_schema_only';
  }
  return getDatabaseUrl();
}
