/**
 * Idempotent super-admin bootstrap for CI / `npm run build`.
 *
 * If all of SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_PHONE, SUPER_ADMIN_FULL_NAME
 * are set, connects and ensures one super-admin row exists. If those vars are all unset (or all
 * empty), exits 0 without connecting to the DB.
 *
 * **Does not insert a new user on every build.** It looks up by `SUPER_ADMIN_EMAIL` first:
 * - Super admin already there → no-op (no second row, password unchanged).
 * - Staff admin exists but not super → single `UPDATE` to set `is_super_admin`.
 * - No user with that email → one `INSERT` (first time only).
 *
 * Run manually: `npm run ensure-super-admin-from-env`
 */
import '../src/bootstrap-env';
import * as bcrypt from 'bcrypt';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { Prisma, PrismaClient } from '@prisma/client';
import { getPrismaMariaDbAdapterConfig } from '../src/core/database/database-url';

const SALT_ROUNDS = 10;

type Bootstrap = {
  email: string;
  password: string;
  phone: string;
  fullName: string;
};

function readBootstrapFromEnv(): Bootstrap | null {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = (process.env.SUPER_ADMIN_PASSWORD ?? '').trim();
  const phone = process.env.SUPER_ADMIN_PHONE?.trim();
  const fullName = process.env.SUPER_ADMIN_FULL_NAME?.trim();

  const any = Boolean(email) || password.length > 0 || Boolean(phone) || Boolean(fullName);

  if (!any) {
    return null;
  }

  if (!email || !password || !phone || !fullName) {
    throw new Error(
      'ensure-super-admin-from-env: set all of SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_PHONE, SUPER_ADMIN_FULL_NAME (or leave all unset to skip).',
    );
  }

  if (password.length < 8) {
    throw new Error(
      'ensure-super-admin-from-env: SUPER_ADMIN_PASSWORD must be at least 8 characters.',
    );
  }

  return { email, password, phone, fullName };
}

async function main(): Promise<void> {
  let bootstrap: Bootstrap | null;
  try {
    bootstrap = readBootstrapFromEnv();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
    return;
  }

  if (!bootstrap) {
    console.log(
      'ensure-super-admin-from-env: skipped (no SUPER_ADMIN_* env vars; super admin is not created).',
    );
    return;
  }

  const adapter = new PrismaMariaDb(getPrismaMariaDbAdapterConfig());
  const prisma = new PrismaClient({ adapter });

  console.log(
    'ensure-super-admin-from-env: checking DB (idempotent — only inserts if this email has no user yet).',
  );

  try {
    const existing = await prisma.user.findUnique({
      where: { email: bootstrap.email },
      select: { id: true, email: true, isAdmin: true, isSuperAdmin: true },
    });

    if (existing) {
      if (!existing.isAdmin) {
        console.error(
          `ensure-super-admin-from-env: user ${bootstrap.email} exists but is not a staff admin (is_admin is false).`,
        );
        process.exitCode = 1;
        return;
      }
      if (!existing.isSuperAdmin) {
        await prisma.user.update({
          where: { id: existing.id },
          data: { isSuperAdmin: true },
        });
        console.log(
          `ensure-super-admin-from-env: promoted existing staff user to super admin (${bootstrap.email}).`,
        );
        return;
      }
      console.log(
        `ensure-super-admin-from-env: super admin already exists (${bootstrap.email}) — skipping create (safe on every build).`,
      );
      return;
    }

    const driver = await prisma.driver.findUnique({ where: { email: bootstrap.email } });
    if (driver) {
      console.error(
        `ensure-super-admin-from-env: email ${bootstrap.email} is already used by a driver; choose another SUPER_ADMIN_EMAIL.`,
      );
      process.exitCode = 1;
      return;
    }

    const existingUserByPhone = await prisma.user.findUnique({ where: { phone: bootstrap.phone } });
    if (existingUserByPhone) {
      console.error(
        `ensure-super-admin-from-env: SUPER_ADMIN_PHONE is already used by staff user ${existingUserByPhone.email}.`,
      );
      process.exitCode = 1;
      return;
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
    console.log(`ensure-super-admin-from-env: created super admin ${user.id} (${user.email}).`);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const target = (e.meta as { target?: string[] } | undefined)?.target;
      const fields = Array.isArray(target) ? target.join(', ') : 'unknown field(s)';
      console.error(
        `ensure-super-admin-from-env: unique constraint failed (${fields}). Email and phone must be unused.`,
      );
    } else {
      console.error(e);
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
