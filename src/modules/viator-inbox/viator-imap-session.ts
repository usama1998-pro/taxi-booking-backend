import { Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import type { HostingerInboxConfig } from './viator-inbox.config';

const logger = new Logger('ViatorImapSession');

const CONNECTION_TIMEOUT_MS = 30_000;
const SOCKET_TIMEOUT_MS = 120_000;

export function createImapClient(cfg: HostingerInboxConfig): ImapFlow {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: CONNECTION_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
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
