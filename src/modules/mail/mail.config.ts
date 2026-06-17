export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
};

export function isSmtpConfigured(): boolean {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  return Boolean(host && user && pass);
}

function resolveSmtpHost(): string | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    return null;
  }
  const lower = host.toLowerCase();
  if (lower.startsWith('imap.')) {
    return `smtp.${host.slice(5)}`;
  }
  if (lower.includes('hostinger') && !lower.startsWith('smtp.')) {
    return 'smtp.hostinger.com';
  }
  return host;
}

function resolveSmtpPort(host: string): number {
  const portRaw = process.env.SMTP_PORT?.trim();
  let port = portRaw ? Number(portRaw) : 465;
  if (!Number.isFinite(port)) {
    return 465;
  }
  // Common typo on Hostinger: 456 instead of 465 (implicit SSL).
  if (port === 456 && host.toLowerCase().includes('hostinger')) {
    return 465;
  }
  return port;
}

export function getSmtpPortWarning(): string | null {
  const portRaw = process.env.SMTP_PORT?.trim();
  if (portRaw === '456') {
    return 'SMTP_PORT=456 is invalid for Hostinger; use 465 (SSL) or 587 (STARTTLS).';
  }
  return null;
}

export function getSmtpConfig(): SmtpConfig | null {
  if (!isSmtpConfigured()) {
    return null;
  }
  const host = resolveSmtpHost();
  if (!host) {
    return null;
  }
  const port = resolveSmtpPort(host);
  const secure =
    process.env.SMTP_SECURE?.trim() !== '0' &&
    process.env.SMTP_SECURE?.trim()?.toLowerCase() !== 'false';

  return {
    host,
    port,
    secure: port === 465 ? true : secure,
    user: process.env.SMTP_USER!.trim(),
    pass: process.env.SMTP_PASS!.trim(),
    fromName: process.env.MAIL_FROM_NAME?.trim() || 'BarcelonaTaxi24',
  };
}

/** Dispatcher / owner inbox for new-booking alerts. */
export function getBookingNotifyEmail(): string | null {
  const notify = process.env.BOOKING_NOTIFY_EMAIL?.trim().toLowerCase();
  if (notify) {
    return notify;
  }
  const smtpUser = process.env.SMTP_USER?.trim().toLowerCase();
  if (smtpUser?.includes('@')) {
    return smtpUser;
  }
  const superAdmin = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  return superAdmin || null;
}
