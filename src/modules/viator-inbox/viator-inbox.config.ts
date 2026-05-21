export type HostingerInboxConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  mailbox: string;
};

const DEFAULT_IMAP_PORT = 993;

function readSharedMailboxCredentials(): { user: string; pass: string } | null {
  const user = process.env.IMAP_USER?.trim() || process.env.SMTP_USER?.trim();
  const pass = process.env.IMAP_PASS?.trim() || process.env.SMTP_PASS?.trim();
  if (!user || !pass) {
    return null;
  }
  return { user, pass };
}

function resolveImapHost(): string | null {
  const explicit = process.env.IMAP_HOST?.trim();
  if (explicit) {
    return explicit;
  }

  const smtpHost = process.env.SMTP_HOST?.trim();
  if (!smtpHost) {
    return null;
  }

  const lower = smtpHost.toLowerCase();
  if (lower.includes('hostinger')) {
    return 'imap.hostinger.com';
  }
  if (lower.startsWith('smtp.')) {
    return `imap.${smtpHost.slice(5)}`;
  }
  if (lower.startsWith('imap.')) {
    return smtpHost;
  }
  return smtpHost;
}

/**
 * Hostinger IMAP mailbox that receives Viator "New Booking for … (#BR-…)" emails.
 * Uses IMAP_HOST/IMAP_PORT when set, otherwise derives host from SMTP_HOST.
 */
export function isHostingerInboxConfigured(): boolean {
  return Boolean(resolveImapHost() && readSharedMailboxCredentials());
}

export function getHostingerInboxConfig(): HostingerInboxConfig | null {
  const host = resolveImapHost();
  const auth = readSharedMailboxCredentials();
  if (!host || !auth) {
    return null;
  }

  const portRaw = process.env.IMAP_PORT?.trim();
  const port = portRaw ? Number(portRaw) : DEFAULT_IMAP_PORT;

  return {
    host,
    port: Number.isFinite(port) ? port : DEFAULT_IMAP_PORT,
    user: auth.user,
    pass: auth.pass,
    mailbox: process.env.IMAP_MAILBOX?.trim() || 'INBOX',
  };
}

/** @deprecated alias */
export const isImapConfigured = isHostingerInboxConfigured;
/** @deprecated alias */
export const getImapConfig = getHostingerInboxConfig;
