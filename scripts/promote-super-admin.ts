/**
 * Sets `is_super_admin` on an existing staff user (`is_admin` must already be true).
 * Run from `backend`: `npm run promote-super-admin`
 */
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
import * as readline from 'node:readline/promises';
import { getPrismaMariaDbAdapterConfig } from '../src/core/database/database-url';

async function main(): Promise<void> {
  const adapter = new PrismaMariaDb(getPrismaMariaDbAdapterConfig());
  const prisma = new PrismaClient({ adapter });
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const email = (await rl.question('Staff user email (must be is_admin): '))
      .trim()
      .toLowerCase();
    if (!email) {
      console.error('Email is required.');
      process.exitCode = 1;
      return;
    }
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, isAdmin: true, isSuperAdmin: true },
    });
    if (!user) {
      console.error('No user with that email.');
      process.exitCode = 1;
      return;
    }
    if (!user.isAdmin) {
      console.error('That user is not a staff admin (is_admin is false).');
      process.exitCode = 1;
      return;
    }
    if (user.isSuperAdmin) {
      console.log(`Already super admin: ${user.email}`);
      return;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { isSuperAdmin: true },
    });
    console.log(`Promoted to super admin: ${user.email}`);
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    rl.close();
  }
}

void main();
