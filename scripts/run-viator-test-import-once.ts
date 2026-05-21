/**
 * Runs one synchronous test inbox import (IMAP + DB). For local verification.
 * Usage: npm run run-viator-test-import-once
 */
import '../src/bootstrap-env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ViatorInboxService } from '../src/modules/viator-inbox/viator-inbox.service';
import { PrismaService } from '../src/core/database/prisma.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const viator = app.get(ViatorInboxService);
    const prisma = app.get(PrismaService);

    console.log('Starting test inbox import (background, waiting up to 90s)...');
    const enqueued = viator.enqueueInboxCheck();
    console.log('Enqueue:', enqueued);

    for (let i = 0; i < 45; i += 1) {
      await new Promise((r) => setTimeout(r, 2000));
      const latest = await prisma.booking.findFirst({
        where: { bookingReference: { startsWith: 'BR-' } },
        orderBy: { createdAt: 'desc' },
        select: {
          uuid: true,
          bookingReference: true,
          customerName: true,
          createdAt: true,
        },
      });
      if (latest && Date.now() - latest.createdAt.getTime() < 120_000) {
        console.log('Latest booking in DB:', latest);
        const alert = await prisma.viatorAlert.findFirst({
          where: { viatorReference: latest.bookingReference },
          orderBy: { receivedAt: 'desc' },
        });
        console.log('Matching viator_alert:', alert?.id ?? '(none)');
        return;
      }
    }

    console.log(
      'No new BR- booking in DB within 90s. Check logs above for IMAP timeout or import errors.',
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
