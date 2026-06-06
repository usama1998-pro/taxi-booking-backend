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

  async sendBookingConfirmation(to: string, booking?: BookingPublic): Promise<boolean> {
    if (!this.mailerService || !isSmtpConfigured()) {
      this.logger.warn('SMTP not configured — skipping booking confirmation email');
      return false;
    }

    const reference = booking?.bookingReference ?? 'your booking';
    const details = booking ? buildBookingDetailsHtml(booking) : '';

    try {
      await this.mailerService.sendMail({
        to: to.trim().toLowerCase(),
        subject: `Booking confirmed — ${reference}`,
        html: `
          <h1>Booking confirmed</h1>
          <p>Thank you. Your taxi booking (${escapeHtml(reference)}) was received successfully.</p>
          ${details ? `<h2>Booking details</h2>${details}` : ''}
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
