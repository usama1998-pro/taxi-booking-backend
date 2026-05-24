/**
 * Sends a Viator-style TEST email into the Hostinger mailbox (SMTP_USER).
 * Subject contains (#BR-TEST). Body includes Booking Reference: BR-… (saved on import).
 * Re-running check on the same email is skipped (deduped by IMAP uid).
 *
 * Usage:
 *   npm run send-viator-test-email                     # default airport transfer
 *   npm run send-viator-test-email -- --cruise-ship    # city → cruise port (Celebrity Equinox)
 *   npm run send-viator-test-email -- --cruise-ship "MSC Meraviglia"
 */
import '../src/bootstrap-env';
import * as nodemailer from 'nodemailer';
import { getSmtpConfig } from '../src/modules/mail/mail.config';
import {
  buildViatorTestEmailBodies,
  buildViatorTestCruiseShipEmailBodies,
  buildViatorTestEmailSubject,
  defaultTestPickupDateLabel,
  generateViatorTestBookingReference,
  VIATOR_TEST_SUBJECT_MARKER,
} from '../src/modules/viator-inbox/viator-test-email';

function parseCruiseShipArg(): string | null {
  const idx = process.argv.indexOf('--cruise-ship');
  if (idx === -1) {
    return null;
  }
  const next = process.argv[idx + 1];
  if (next && !next.startsWith('--')) {
    return next;
  }
  return '';
}

async function main(): Promise<void> {
  const smtp = getSmtpConfig();
  if (!smtp) {
    console.error(
      'SMTP not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in backend/.env',
    );
    process.exit(1);
  }

  const cruiseShipArg = parseCruiseShipArg();
  const isCruiseShip = cruiseShipArg !== null;

  const pickupDateLabel = defaultTestPickupDateLabel();
  const bookingReference = generateViatorTestBookingReference();
  const subject = buildViatorTestEmailSubject(pickupDateLabel);

  const { text, html, productCode } = isCruiseShip
    ? buildViatorTestCruiseShipEmailBodies({
        pickupDateLabel,
        bookingReference,
        cruiseShipName: cruiseShipArg || undefined,
      })
    : buildViatorTestEmailBodies({
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

  console.log(
    isCruiseShip
      ? 'Viator test email sent (city → cruise port).'
      : 'Viator test email sent.',
  );
  console.log(`  To: ${smtp.user}`);
  console.log(`  Subject: ${subject}`);
  console.log(`  Marker: #${VIATOR_TEST_SUBJECT_MARKER}`);
  console.log(`  Booking reference (body): ${bookingReference}`);
  console.log(`  Product code (body): ${productCode}`);
  if (isCruiseShip) {
    console.log(`  Cruise ship: ${cruiseShipArg || 'Celebrity Equinox'}`);
  }
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
