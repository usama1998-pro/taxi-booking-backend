import { Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import type { HostingerInboxConfig } from './viator-inbox.config';

const logger = new Logger('ViatorImapSession');

const DEFAULT_CONNECTION_TIMEOUT_MS = 120_000;

function resolveImapTimeoutMs(): number {
  const raw = process.env.IMAP_SOCKET_TIMEOUT_MS?.trim();
  if (!raw) {
    return DEFAULT_CONNECTION_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 30_000
    ? parsed
    : DEFAULT_CONNECTION_TIMEOUT_MS;
}

export function createImapClient(cfg: HostingerInboxConfig): ImapFlow {
  const timeoutMs = resolveImapTimeoutMs();
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
  });

  client.on('error', (err) => {
    logger.warn(
      `IMAP client error (${cfg.user}@${cfg.host}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  });

  return client;
}

export async function withImapSession<T>(
  cfg: HostingerInboxConfig,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = createImapClient(cfg);
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.logout().catch(() => undefined);
  }
}
