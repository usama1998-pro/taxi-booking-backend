/**
 * Creates a staff `User` with `is_admin` so they can call POST /auth/signin (after drivers are ruled out by email).
 * Optionally sets `is_super_admin` for managing driver verification codes via `/admin/driver-verification-codes`.
 * Run from `backend`: `npm run create-admin`
 * Requires the same database env vars as the API (e.g. DATABASE_URL).
 */
import '../src/bootstrap-env';
import * as bcrypt from 'bcrypt';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
import * as readline from 'node:readline/promises';
import { getPrismaMariaDbAdapterConfig } from '../src/core/database/database-url';

const SALT_ROUNDS = 10;

async function main(): Promise<void> {
  const adapter = new PrismaMariaDb(getPrismaMariaDbAdapterConfig());
  const prisma = new PrismaClient({ adapter });
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const fullName = (await rl.question('Full name: ')).trim();
    const email = (await rl.question('Email: ')).trim().toLowerCase();
    const phone = (await rl.question('Phone: ')).trim();
    const password = (await rl.question('Password (min 8 chars): ')).trim();
    const password2 = (await rl.question('Password (again): ')).trim();
    const superRaw = (
      await rl.question('Super admin? (y/N — super admins manage driver verification codes): ')
    )
      .trim()
      .toLowerCase();
    const isSuperAdmin = superRaw === 'y' || superRaw === 'yes';

    if (!fullName || !email || !phone || !password) {
      console.error('All fields are required.');
      process.exitCode = 1;
      return;
    }
    if (password.length < 8) {
      console.error('Password must be at least 8 characters.');
      process.exitCode = 1;
      return;
    }
    if (password !== password2) {
      console.error('Passwords do not match.');
      process.exitCode = 1;
      return;
    }

    const driver = await prisma.driver.findUnique({ where: { email } });
    if (driver) {
      console.error(
        'That email is already used by a driver account; choose another email for admin.',
      );
      process.exitCode = 1;
      return;
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        phone,
        password: hash,
        isAdmin: true,
        isSuperAdmin,
      },
    });
    console.log(
      `Admin user created: ${user.id} (${user.email})${isSuperAdmin ? ' [super admin]' : ''}.`,
    );
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    rl.close();
  }
}

void main();
