import { Injectable, Logger, Optional } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import type { BookingPublic } from '../bookings/bookings.service';
import {
  getBookingNotifyEmail,
  getSmtpConfig,
  isSmtpConfigured,
} from './mail.config';

export type BookingEmailResult = {
  customerEmailSent: boolean;
  ownerEmailSent: boolean;
};

function locationLabel(location: Record<string, unknown> | null | undefined): string {
  if (!location || typeof location !== 'object') {
    return '—';
  }
  const label = location.label;
  if (typeof label === 'string' && label.trim()) {
    return label.trim();
  }
  const address = location.address;
  if (typeof address === 'string' && address.trim()) {
    return address.trim();
  }
  return '—';
}

function formatScheduledTime(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  const timeZone = process.env.TZ?.trim() || 'Europe/Madrid';
  return date.toLocaleString('en-GB', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Optional() private readonly mailerService?: MailerService,
  ) {}

  isEnabled(): boolean {
    return isSmtpConfigured() && Boolean(this.mailerService);
  }

  async sendBookingConfirmation(to: string, booking?: BookingPublic): Promise<boolean> {
    if (!this.mailerService || !isSmtpConfigured()) {
      this.logger.warn('SMTP not configured — skipping booking confirmation email');
      return false;
    }

    const reference = booking?.bookingReference ?? 'your booking';
    const pickup = booking
      ? locationLabel(booking.pickupLocation as Record<string, unknown>)
      : null;
    const dropoff = booking
      ? locationLabel(booking.dropoffLocation as Record<string, unknown>)
      : null;
    const scheduled = booking?.scheduledTime
      ? formatScheduledTime(booking.scheduledTime)
      : null;

    const details =
      booking && pickup && dropoff && scheduled
        ? `
        <ul>
          <li><strong>Reference:</strong> ${booking.bookingReference}</li>
          <li><strong>Pickup:</strong> ${pickup}</li>
          <li><strong>Drop-off:</strong> ${dropoff}</li>
          <li><strong>Scheduled:</strong> ${scheduled}</li>
          <li><strong>Passengers:</strong> ${booking.passengerCount}</li>
        </ul>
      `
        : '';

    try {
      await this.mailerService.sendMail({
        to: to.trim().toLowerCase(),
        subject: `Booking confirmed — ${reference}`,
        html: `
          <h1>Booking confirmed</h1>
          <p>Thank you. Your taxi booking (${reference}) was received successfully.</p>
          ${details}
          <p>We will contact you if anything changes.</p>
        `,
      });
      return true;
    } catch (err) {
      this.logger.error(
        `Failed to send booking confirmation to ${to}`,
        err instanceof Error ? err.stack : String(err),
      );
      return false;
    }
  }

  async sendNewBookingAlert(booking: BookingPublic): Promise<boolean> {
    const notifyTo = getBookingNotifyEmail();
    if (!notifyTo) {
      return false;
    }
    if (!this.mailerService || !isSmtpConfigured()) {
      return false;
    }

    const customerEmail =
      booking.customerEmail?.trim().toLowerCase() ??
      booking.user?.email?.trim().toLowerCase() ??
      '—';
    const customerName =
      booking.customerName?.trim() ?? booking.user?.fullName?.trim() ?? '—';
    const pickup = locationLabel(booking.pickupLocation as Record<string, unknown>);
    const dropoff = locationLabel(booking.dropoffLocation as Record<string, unknown>);
    const scheduled = formatScheduledTime(booking.scheduledTime);

    try {
      await this.mailerService.sendMail({
        to: notifyTo,
        subject: `New booking — ${booking.bookingReference}`,
        html: `
          <h1>New booking received</h1>
          <ul>
            <li><strong>Reference:</strong> ${booking.bookingReference}</li>
            <li><strong>Customer:</strong> ${customerName}</li>
            <li><strong>Email:</strong> ${customerEmail}</li>
            <li><strong>Phone:</strong> ${booking.customerPhone ?? booking.user?.phone ?? '—'}</li>
            <li><strong>Pickup:</strong> ${pickup}</li>
            <li><strong>Drop-off:</strong> ${dropoff}</li>
            <li><strong>Scheduled:</strong> ${scheduled}</li>
            <li><strong>Status:</strong> ${booking.status}</li>
          </ul>
        `,
      });
      return true;
    } catch (err) {
      this.logger.error(
        `Failed to send new-booking alert to ${notifyTo}`,
        err instanceof Error ? err.stack : String(err),
      );
      return false;
    }
  }

  async sendBookingEmails(booking: BookingPublic): Promise<BookingEmailResult> {
    const customerEmail =
      booking.customerEmail?.trim().toLowerCase() ??
      booking.user?.email?.trim().toLowerCase();

    const [customerEmailSent, ownerEmailSent] = await Promise.all([
      customerEmail
        ? this.sendBookingConfirmation(customerEmail, booking)
        : Promise.resolve(false),
      this.sendNewBookingAlert(booking),
    ]);

    return { customerEmailSent, ownerEmailSent };
  }

  async sendTestEmail(to: string): Promise<void> {
    if (!this.mailerService || !isSmtpConfigured()) {
      throw new Error(
        'SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env',
      );
    }
    const smtp = getSmtpConfig()!;
    await this.mailerService.sendMail({
      to: to.trim().toLowerCase(),
      subject: 'SMTP test — taxi booking API',
      html: `<p>SMTP from <strong>${smtp.user}</strong> is working.</p>`,
    });
  }
}
