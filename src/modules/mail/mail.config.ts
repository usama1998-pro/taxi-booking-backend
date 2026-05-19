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

export function getSmtpConfig(): SmtpConfig | null {
  if (!isSmtpConfigured()) {
    return null;
  }
  const portRaw = process.env.SMTP_PORT?.trim();
  const port = portRaw ? Number(portRaw) : 465;
  const secure =
    process.env.SMTP_SECURE?.trim() !== '0' &&
    process.env.SMTP_SECURE?.trim()?.toLowerCase() !== 'false';

  return {
    host: process.env.SMTP_HOST!.trim(),
    port: Number.isFinite(port) ? port : 465,
    secure: port === 465 ? true : secure,
    user: process.env.SMTP_USER!.trim(),
    pass: process.env.SMTP_PASS!.trim(),
    fromName: process.env.MAIL_FROM_NAME?.trim() || 'Taxi Booking',
  };
}

/** Dispatcher / owner inbox for new-booking alerts (falls back to SUPER_ADMIN_EMAIL). */
export function getBookingNotifyEmail(): string | null {
  const notify = process.env.BOOKING_NOTIFY_EMAIL?.trim().toLowerCase();
  if (notify) {
    return notify;
  }
  const superAdmin = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  return superAdmin || null;
}
