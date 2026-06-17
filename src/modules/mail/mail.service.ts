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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatFareEur(price: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'EUR',
  }).format(price);
}

function formatChildSeatsSummary(booking: BookingPublic): string | null {
  const parts: string[] = [];
  if (booking.infantCarrierCount > 0) {
    parts.push(
      `${booking.infantCarrierCount} infant carrier${booking.infantCarrierCount === 1 ? '' : 's'}`,
    );
  }
  if (booking.childSeatCount > 0) {
    parts.push(`${booking.childSeatCount} child seat${booking.childSeatCount === 1 ? '' : 's'}`);
  }
  if (booking.boosterCount > 0) {
    parts.push(`${booking.boosterCount} booster${booking.boosterCount === 1 ? '' : 's'}`);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

function buildDetailRow(label: string, value: string): string {
  return `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`;
}

function buildBookingDetailsHtml(booking: BookingPublic): string {
  const customerName =
    booking.customerName?.trim() ?? booking.user?.fullName?.trim() ?? '—';
  const customerEmail =
    booking.customerEmail?.trim().toLowerCase() ?? booking.user?.email?.trim().toLowerCase() ?? '—';
  const customerPhone = booking.customerPhone?.trim() ?? booking.user?.phone?.trim() ?? '—';
  const pickup = locationLabel(booking.pickupLocation as Record<string, unknown>);
  const dropoff = locationLabel(booking.dropoffLocation as Record<string, unknown>);
  const scheduled = formatScheduledTime(booking.scheduledTime);
  const returnTime = booking.returnTime ? formatScheduledTime(booking.returnTime) : null;
  const childSeats = formatChildSeatsSummary(booking);
  const flight = booking.flightNumber?.trim() || null;
  const note = booking.note?.trim() || null;
  const driver = booking.driver?.name?.trim() || null;

  const rows = [
    buildDetailRow('Reference', booking.bookingReference),
    buildDetailRow('Passenger', customerName),
    buildDetailRow('Email', customerEmail),
    buildDetailRow('Phone', customerPhone),
    buildDetailRow('Pickup', pickup),
    buildDetailRow('Drop-off', dropoff),
    buildDetailRow('Pickup date & time', scheduled),
  ];

  if (returnTime) {
    rows.push(buildDetailRow('Return date & time', returnTime));
  }

  rows.push(buildDetailRow('Passengers', String(booking.passengerCount)));
  rows.push(buildDetailRow('Luggage pieces', String(booking.luggageCount)));

  if (childSeats) {
    rows.push(buildDetailRow('Child seats', childSeats));
  }

  if (flight) {
    rows.push(buildDetailRow('Flight number', flight));
  }

  if (note) {
    rows.push(buildDetailRow('Notes', note));
  }

  if (driver) {
    rows.push(buildDetailRow('Driver', driver));
  }

  rows.push(buildDetailRow('Total fare', formatFareEur(booking.price)));
  rows.push(buildDetailRow('Status', booking.status));

  return `<ul>${rows.join('')}</ul>`;
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

  private smtpLogContext(): string {
    const smtp = getSmtpConfig();
    if (!smtp) {
      return 'smtp=not-configured';
    }
    return `from=${smtp.user} host=${smtp.host}:${smtp.port} secure=${smtp.secure}`;
  }

  async sendBookingConfirmation(to: string, booking?: BookingPublic): Promise<boolean> {
    const recipient = to.trim().toLowerCase();
    if (!this.mailerService || !isSmtpConfigured()) {
      this.logger.warn('SMTP not configured — skipping booking confirmation email');
      return false;
    }

    const reference = booking?.bookingReference ?? 'your booking';
    const details = booking ? buildBookingDetailsHtml(booking) : '';

    this.logger.log(
      `Sending booking confirmation: reference=${reference} to=${recipient} ${this.smtpLogContext()}`,
    );
    try {
      await this.mailerService.sendMail({
        to: recipient,
        subject: `Booking confirmed — ${reference}`,
        html: `
          <h1>Booking confirmed</h1>
          <p>Thank you. Your taxi booking (${escapeHtml(reference)}) was received successfully.</p>
          ${details ? `<h2>Booking details</h2>${details}` : ''}
          <p>We will contact you if anything changes.</p>
        `,
      });
      this.logger.log(
        `Booking confirmation sent: reference=${reference} to=${recipient}`,
      );
      return true;
    } catch (err) {
      this.logger.error(
        `Failed to send booking confirmation: reference=${reference} to=${recipient} (${this.smtpLogContext()})`,
        err instanceof Error ? err.stack : String(err),
      );
      return false;
    }
  }

  async sendNewBookingAlert(booking: BookingPublic): Promise<boolean> {
    const notifyTo = getBookingNotifyEmail();
    if (!notifyTo) {
      this.logger.warn(
        'BOOKING_NOTIFY_EMAIL / SMTP_USER not set — skipping owner new-booking alert',
      );
      return false;
    }
    if (!this.mailerService || !isSmtpConfigured()) {
      this.logger.warn('SMTP not configured — skipping owner new-booking alert');
      return false;
    }

    const reference = booking.bookingReference;
    const heading = `New Booking - ${reference}`;

    this.logger.log(
      `Sending new-booking alert: reference=${reference} to=${notifyTo} ${this.smtpLogContext()}`,
    );
    try {
      await this.mailerService.sendMail({
        to: notifyTo,
        subject: heading,
        html: `
          <h1>${escapeHtml(heading)}</h1>
          <p>A new taxi booking has been received. Customer and trip details are below.</p>
          <h2>Booking details</h2>
          ${buildBookingDetailsHtml(booking)}
        `,
      });
      this.logger.log(
        `New-booking alert sent: reference=${reference} to=${notifyTo}`,
      );
      return true;
    } catch (err) {
      this.logger.error(
        `Failed to send new-booking alert: reference=${reference} to=${notifyTo} (${this.smtpLogContext()})`,
        err instanceof Error ? err.stack : String(err),
      );
      return false;
    }
  }

  async sendBookingEmails(booking: BookingPublic): Promise<BookingEmailResult> {
    const customerEmail =
      booking.customerEmail?.trim().toLowerCase() ??
      booking.user?.email?.trim().toLowerCase();
    const notifyTo = getBookingNotifyEmail();

    this.logger.log(
      `Sending booking emails: reference=${booking.bookingReference} customer=${customerEmail ?? 'none'} owner=${notifyTo ?? 'none'}`,
    );

    const [customerEmailSent, ownerEmailSent] = await Promise.all([
      customerEmail
        ? this.sendBookingConfirmation(customerEmail, booking)
        : Promise.resolve(false),
      this.sendNewBookingAlert(booking),
    ]);

    this.logger.log(
      `Booking emails finished: reference=${booking.bookingReference} customerEmailSent=${customerEmailSent} ownerEmailSent=${ownerEmailSent}`,
    );

    return { customerEmailSent, ownerEmailSent };
  }

  async sendTestEmail(to: string): Promise<{ sentTo: string[] }> {
    const recipient = to.trim().toLowerCase();
    if (!this.mailerService || !isSmtpConfigured()) {
      this.logger.warn('SMTP not configured — cannot send test email');
      throw new Error(
        'SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env',
      );
    }
    const smtp = getSmtpConfig()!;
    const notifyTo = getBookingNotifyEmail();
    const recipients = [...new Set([recipient, notifyTo].filter(Boolean) as string[])];

    this.logger.log(
      `Sending SMTP test email: to=${recipients.join(',')} ${this.smtpLogContext()}`,
    );

    const sentTo: string[] = [];
    const failures: string[] = [];

    for (const address of recipients) {
      try {
        await this.mailerService.sendMail({
          to: address,
          subject: 'SMTP test — taxi booking API',
          html: `<p>SMTP from <strong>${smtp.user}</strong> is working.</p>`,
        });
        sentTo.push(address);
        this.logger.log(`SMTP test email sent successfully to ${address}`);
      } catch (err) {
        failures.push(address);
        this.logger.error(
          `Failed to send SMTP test email to ${address} (${this.smtpLogContext()})`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    if (sentTo.length === 0) {
      throw new Error(
        `SMTP test failed for all recipients: ${recipients.join(', ')}`,
      );
    }

    if (failures.length > 0) {
      this.logger.warn(
        `SMTP test partially failed: sent=${sentTo.join(',')} failed=${failures.join(',')}`,
      );
    }

    return { sentTo };
  }
}
