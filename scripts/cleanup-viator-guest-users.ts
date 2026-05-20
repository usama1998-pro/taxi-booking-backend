/**
 * One-time cleanup for legacy Viator guest users that were auto-created in `User`.
 *
 * Default mode is dry-run (no writes):
 *   npm run cleanup-viator-guests
 *
 * Apply changes:
 *   npm run cleanup-viator-guests -- --apply
 *
 * What it does in apply mode:
 * 1) Resolves a target staff user (SUPER_ADMIN_EMAIL if valid, else first admin user).
 * 2) Reassigns bookings owned by legacy Viator guest users to that staff user.
 * 3) Deletes those legacy guest users.
 */
import '../src/bootstrap-env';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
import { getPrismaMariaDbAdapterConfig } from '../src/core/database/database-url';

type TargetStaffUser = { id: string; email: string };

const APPLY_FLAG = '--apply';
const VIATOR_GUEST_EMAIL_PATTERN = 'viator.%@taxibarcelona24.guest';

async function resolveTargetStaffUser(prisma: PrismaClient): Promise<TargetStaffUser> {
  const configuredEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  if (configuredEmail) {
    const configured = await prisma.user.findUnique({
      where: { email: configuredEmail },
      select: { id: true, email: true, isAdmin: true },
    });
    if (configured?.isAdmin) {
      return { id: configured.id, email: configured.email };
    }
    console.warn(
      `cleanup-viator-guests: SUPER_ADMIN_EMAIL is not an admin user in DB (${configuredEmail}), falling back to first admin user.`,
    );
  }

  const fallback = await prisma.user.findFirst({
    where: { isAdmin: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true },
  });
  if (!fallback) {
    throw new Error(
      'cleanup-viator-guests: no admin user found. Create an admin first, then rerun.',
    );
  }
  return fallback;
}

async function main(): Promise<void> {
  const apply = process.argv.includes(APPLY_FLAG);

  const adapter = new PrismaMariaDb(getPrismaMariaDbAdapterConfig());
  const prisma = new PrismaClient({ adapter });

  try {
    const targetStaff = await resolveTargetStaffUser(prisma);
    const legacyGuestUsers = await prisma.user.findMany({
      where: {
        isAdmin: false,
        email: { startsWith: 'viator.', endsWith: '@taxibarcelona24.guest' },
      },
      select: { id: true, email: true },
      orderBy: { createdAt: 'asc' },
    });

    if (legacyGuestUsers.length === 0) {
      console.log('cleanup-viator-guests: no legacy Viator guest users found.');
      return;
    }

    const legacyGuestUserIds = legacyGuestUsers.map((u) => u.id);
    const impactedBookings = await prisma.booking.count({
      where: { userId: { in: legacyGuestUserIds } },
    });

    console.log(`cleanup-viator-guests: mode=${apply ? 'APPLY' : 'DRY_RUN'}`);
    console.log(
      `cleanup-viator-guests: target staff user = ${targetStaff.email} (${targetStaff.id})`,
    );
    console.log(
      `cleanup-viator-guests: users matched = ${legacyGuestUsers.length} (pattern: ${VIATOR_GUEST_EMAIL_PATTERN})`,
    );
    console.log(`cleanup-viator-guests: bookings to reassign = ${impactedBookings}`);

    if (!apply) {
      console.log(
        `cleanup-viator-guests: dry-run only. Re-run with ${APPLY_FLAG} to execute.`,
      );
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const reassigned = await tx.booking.updateMany({
        where: { userId: { in: legacyGuestUserIds } },
        data: { userId: targetStaff.id },
      });
      const deleted = await tx.user.deleteMany({
        where: { id: { in: legacyGuestUserIds } },
      });
      return { reassigned: reassigned.count, deleted: deleted.count };
    });

    console.log(
      `cleanup-viator-guests: done. bookings reassigned=${result.reassigned}, users deleted=${result.deleted}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
