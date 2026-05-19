import { getSmtpConfig, isSmtpConfigured } from '../mail/mail.config';

export type HostingerInboxConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  mailbox: string;
  pollIntervalMs: number;
};

const DEFAULT_POLL_MS = 60_000;

/** Hostinger IMAP host from SMTP_HOST (e.g. smtp.hostinger.com → imap.hostinger.com). */
function resolveImapHost(smtpHost: string): string {
  const lower = smtpHost.toLowerCase();
  if (lower.includes('hostinger')) {
    return 'imap.hostinger.com';
  }
  if (lower.startsWith('smtp.')) {
    return `imap.${smtpHost.slice(5)}`;
  }
  return smtpHost;
}

/**
 * Same mailbox as SMTP_USER / SMTP_PASS. Viator booking emails land there;
 * we read via IMAP and match subjects like `New Booking for … (#BR-…)`.
 */
export function isHostingerInboxConfigured(): boolean {
  return isSmtpConfigured();
}

export function getHostingerInboxConfig(): HostingerInboxConfig | null {
  const smtp = getSmtpConfig();
  if (!smtp) {
    return null;
  }
  return {
    host: resolveImapHost(smtp.host),
    port: 993,
    user: smtp.user,
    pass: smtp.pass,
    mailbox: 'INBOX',
    pollIntervalMs: DEFAULT_POLL_MS,
  };
}

/** @deprecated alias */
export const isImapConfigured = isHostingerInboxConfigured;
/** @deprecated alias */
export const getImapConfig = getHostingerInboxConfig;
