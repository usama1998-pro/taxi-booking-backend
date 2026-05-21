/**
 * Sends a Viator-style TEST email into the Hostinger mailbox (SMTP_USER).
 * Subject contains (#BR-TEST). Body includes Booking Reference: BR-… (saved on import).
 * Re-running check on the same email is skipped (deduped by IMAP uid).
 *
 * Usage: npm run send-viator-test-email
 */
import '../src/bootstrap-env';
import * as nodemailer from 'nodemailer';
import { getSmtpConfig } from '../src/modules/mail/mail.config';
import {
  buildViatorTestEmailBodies,
  buildViatorTestEmailSubject,
  defaultTestPickupDateLabel,
  generateViatorTestBookingReference,
  VIATOR_TEST_SUBJECT_MARKER,
} from '../src/modules/viator-inbox/viator-test-email';

async function main(): Promise<void> {
  const smtp = getSmtpConfig();
  if (!smtp) {
    console.error(
      'SMTP not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in backend/.env',
    );
    process.exit(1);
  }

  const pickupDateLabel = defaultTestPickupDateLabel();
  const bookingReference = generateViatorTestBookingReference();
  const subject = buildViatorTestEmailSubject(pickupDateLabel);
  const { text, html, productCode } = buildViatorTestEmailBodies({
    pickupDateLabel,
    bookingReference,
  });

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  const info = await transport.sendMail({
    from: `"${smtp.fromName}" <${smtp.user}>`,
    to: smtp.user,
    subject,
    text,
    html,
  });

  console.log('Viator test email sent.');
  console.log(`  To: ${smtp.user}`);
  console.log(`  Subject: ${subject}`);
  console.log(`  Marker: #${VIATOR_TEST_SUBJECT_MARKER}`);
  console.log(`  Booking reference (body): ${bookingReference}`);
  console.log(`  Product code (body): ${productCode}`);
  console.log(`  Message id: ${info.messageId ?? '(unknown)'}`);
  console.log('');
  console.log(
    'Next: trigger POST /viator/inbox/check (cron or manual) to import into the database.',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
