import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

const SALT_ROUNDS = 10;

export type SuperAdminBootstrap = {
  email: string;
  password: string;
  phone: string;
  fullName: string;
};

export type EnsureSuperAdminResult =
  | { status: 'skipped' }
  | { status: 'exists' }
  | { status: 'promoted' }
  | { status: 'created'; userId: string }
  | { status: 'error'; message: string };

type BootstrapClient = Pick<PrismaClient, 'user' | 'driver'>;

export function readSuperAdminBootstrapFromEnv(): SuperAdminBootstrap | null {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = (process.env.SUPER_ADMIN_PASSWORD ?? '').trim();
  const phone = process.env.SUPER_ADMIN_PHONE?.trim();
  const fullName = process.env.SUPER_ADMIN_FULL_NAME?.trim();

  const any =
    Boolean(email) || password.length > 0 || Boolean(phone) || Boolean(fullName);

  if (!any) {
    return null;
  }

  if (!email || !password || !phone || !fullName) {
    throw new Error(
      'Set all of SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_PHONE, SUPER_ADMIN_FULL_NAME (or leave all unset to skip).',
    );
  }

  if (password.length < 8) {
    throw new Error('SUPER_ADMIN_PASSWORD must be at least 8 characters.');
  }

  return { email, password, phone, fullName };
}

export async function ensureSuperAdminFromEnv(
  prisma: BootstrapClient,
  bootstrap: SuperAdminBootstrap,
): Promise<EnsureSuperAdminResult> {
  const existing = await prisma.user.findUnique({
    where: { email: bootstrap.email },
    select: { id: true, email: true, isAdmin: true, isSuperAdmin: true },
  });

  if (existing) {
    if (!existing.isAdmin) {
      return {
        status: 'error',
        message: `User ${bootstrap.email} exists but is not a staff admin (is_admin is false).`,
      };
    }
    if (!existing.isSuperAdmin) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { isSuperAdmin: true },
      });
      return { status: 'promoted' };
    }
    return { status: 'exists' };
  }

  const driver = await prisma.driver.findUnique({
    where: { email: bootstrap.email },
  });
  if (driver) {
    return {
      status: 'error',
      message: `Email ${bootstrap.email} is already used by a driver; choose another SUPER_ADMIN_EMAIL.`,
    };
  }

  const existingUserByPhone = await prisma.user.findUnique({
    where: { phone: bootstrap.phone },
  });
  if (existingUserByPhone) {
    return {
      status: 'error',
      message: `SUPER_ADMIN_PHONE is already used by staff user ${existingUserByPhone.email}.`,
    };
  }

  const hash = await bcrypt.hash(bootstrap.password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      fullName: bootstrap.fullName,
      email: bootstrap.email,
      phone: bootstrap.phone,
      password: hash,
      isAdmin: true,
      isSuperAdmin: true,
    },
  });
  return { status: 'created', userId: user.id };
}

export function formatEnsureSuperAdminError(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = (err.meta as { target?: string[] } | undefined)?.target;
    const fields = Array.isArray(target) ? target.join(', ') : 'unknown field(s)';
    return `Unique constraint failed (${fields}). Email and phone must be unused.`;
  }
  return err instanceof Error ? err.message : String(err);
}
