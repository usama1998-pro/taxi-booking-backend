/**
 * Quick IMAP diagnostic for #BR-TEST flow (no DB writes).
 * Usage: npm run debug-viator-inbox-test
 */
import '../src/bootstrap-env';
import { getHostingerInboxConfig } from '../src/modules/viator-inbox/viator-inbox.config';
import { createImapClient } from '../src/modules/viator-inbox/viator-imap-session';
import {
  isViatorTestBookingSubject,
  VIATOR_TEST_SUBJECT_MARKER,
} from '../src/modules/viator-inbox/viator-test-email';

async function main(): Promise<void> {
  const cfg = getHostingerInboxConfig();
  if (!cfg) {
    console.error('IMAP not configured (SMTP_USER / SMTP_PASS or IMAP_*).');
    process.exit(1);
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const client = createImapClient(cfg);
  const t0 = Date.now();

  try {
    await client.connect();
    console.log(`Connected to ${cfg.host} as ${cfg.user}`);

    const lock = await client.getMailboxLock(cfg.mailbox);
    try {
      const searchNewBooking = Date.now();
      const uidsNew = await client.search({
        since,
        subject: 'New Booking for',
      });
      console.log(
        `SEARCH since+subject:"New Booking for" → ${Array.isArray(uidsNew) ? uidsNew.length : 0} uid(s) in ${Date.now() - searchNewBooking}ms`,
      );

      const searchMarker = Date.now();
      try {
        const uidsMarker = await client.search({
          since,
          subject: VIATOR_TEST_SUBJECT_MARKER,
        });
        console.log(
          `SEARCH since+subject:"${VIATOR_TEST_SUBJECT_MARKER}" → ${Array.isArray(uidsMarker) ? uidsMarker.length : 0} uid(s) in ${Date.now() - searchMarker}ms`,
        );
      } catch (err) {
        console.log(
          `SEARCH subject:"${VIATOR_TEST_SUBJECT_MARKER}" failed after ${Date.now() - searchMarker}ms:`,
          err instanceof Error ? err.message : err,
        );
      }

      const uids = Array.isArray(uidsNew) ? uidsNew : [];
      if (uids.length === 0) {
        console.log('No candidates. Run: npm run send-viator-test-email');
        return;
      }

      let testCount = 0;
      for await (const msg of client.fetch(uids.slice(-20), {
        envelope: true,
        uid: true,
      })) {
        const subject = msg.envelope?.subject ?? '(no subject)';
        const date = msg.envelope?.date?.toISOString() ?? '?';
        const isTest = isViatorTestBookingSubject(subject);
        if (isTest) {
          testCount += 1;
        }
        console.log(
          `  uid=${msg.uid} date=${date} test=${isTest} subject=${subject.slice(0, 100)}`,
        );
      }
      console.log(`#BR-TEST matches in last 20 candidates: ${testCount}`);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
    console.log(`Done in ${Date.now() - t0}ms`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
