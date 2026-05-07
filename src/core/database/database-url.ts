import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as fs from 'node:fs';
import type { PoolConfig } from 'mariadb';

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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasUrlQueryParam(url: string, key: string): boolean {
  return new RegExp(`[?&]${escapeRegExp(key)}=`, 'i').test(url);
}

function appendUrlQueryParam(url: string, key: string, value: string): string {
  if (hasUrlQueryParam(url, key)) {
    return url;
  }
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${key}=${encodeURIComponent(value)}`;
}

function isTruthyEnv(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function isFalsyEnv(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === '0' || v === 'false' || v === 'no' || v === 'off';
}

/** TLS enabled but do not verify server certificate (shared hosts with non-public CA). */
function useInsecureTls(): boolean {
  return isTruthyEnv(process.env.DATABASE_SSL) && isFalsyEnv(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED);
}

function parseMariadbUrlToPoolConfig(url: string): PoolConfig {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- no public parse API on `mariadb` root export
  const ConnectionOptions = require('mariadb/lib/config/connection-options') as {
    parse: (connectionString: string) => PoolConfig;
  };
  return ConnectionOptions.parse(url);
}

/**
 * Shared MariaDB connector options from env (applied to every `mysql://` URL).
 * Hostinger / remote MySQL often requires TLS; the driver default `connectTimeout` (1000ms)
 * is often too short for cross-network TLS handshakes — see `DATABASE_SSL` and
 * `DATABASE_CONNECT_TIMEOUT_MS` in `.env.example`.
 */
export function applyEnvMysqlDriverQueryParams(url: string): string {
  let out = url;

  if (isTruthyEnv(process.env.DATABASE_SSL)) {
    out = appendUrlQueryParam(out, 'ssl', 'true');
  }

  if (!hasUrlQueryParam(out, 'connectTimeout')) {
    const custom = process.env.DATABASE_CONNECT_TIMEOUT_MS?.trim();
    if (custom && /^\d+$/.test(custom)) {
      out = appendUrlQueryParam(out, 'connectTimeout', custom);
    } else if (isTruthyEnv(process.env.DATABASE_SSL)) {
      out = appendUrlQueryParam(out, 'connectTimeout', '20000');
    }
  }

  if (isTruthyEnv(process.env.DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL)) {
    out = appendUrlQueryParam(out, 'allowPublicKeyRetrieval', 'true');
  }

  return out;
}

/**
 * Compose service hostname `mysql` only resolves on the Docker network.
 * Nest on the host (Windows/macOS/Linux) must use local loopback + the published host port.
 */
function resolvedDatabaseHost(configured: string | undefined): string {
  const host = (configured ?? 'localhost').trim() || 'localhost';
  if (process.platform === 'win32' && host === 'localhost') {
    // On some Windows setups `localhost` resolves to `::1`; force IPv4 loopback for MariaDB.
    return '127.0.0.1';
  }
  if (host !== 'mysql') {
    return host;
  }
  if (process.platform === 'win32') {
    return '127.0.0.1';
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
    return applyEnvMysqlDriverQueryParams(
      applyPoolConnectionLimit(normalizeToPrismaMysqlUrl(direct)),
    );
  }

  const url = process.env.DATABASE_URL?.trim();
  if (url && isDirectMysqlFamilyUrl(url)) {
    return applyEnvMysqlDriverQueryParams(
      applyPoolConnectionLimit(normalizeToPrismaMysqlUrl(url)),
    );
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
  return applyEnvMysqlDriverQueryParams(
    applyPoolConnectionLimit(
      `mysql://${enc(user)}:${enc(password)}@${host}:${port}/${enc(database)}`,
    ),
  );
}

/**
 * Connection string for the native `mariadb` connector (requires `mariadb://`, not `mysql://`).
 */
export function getMariaDbDriverUrl(): string {
  return getDatabaseUrl().replace(/^mysql:\/\//i, 'mariadb://');
}

/**
 * Prisma MariaDB adapter config. When `DATABASE_SSL=1` and `DATABASE_SSL_REJECT_UNAUTHORIZED=0`,
 * uses a parsed pool config with TLS without cert verification.
 */
export function getPrismaMariaDbAdapterConfig(): ConstructorParameters<typeof PrismaMariaDb>[0] {
  if (!useInsecureTls()) {
    return getDatabaseUrl();
  }
  const url = getMariaDbDriverUrl();
  return {
    ...parseMariadbUrlToPoolConfig(url),
    ssl: { rejectUnauthorized: false },
  } as ConstructorParameters<typeof PrismaMariaDb>[0];
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
