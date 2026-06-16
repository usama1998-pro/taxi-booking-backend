import '../src/bootstrap-env';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
import * as readline from 'node:readline/promises';
import { getPrismaMariaDbAdapterConfig } from '../src/core/database/database-url';

function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 4);
}

async function main(): Promise<void> {
  const adapter = new PrismaMariaDb(getPrismaMariaDbAdapterConfig());
  const prisma = new PrismaClient({ adapter });
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const email = (await rl.question('Admin email: ')).trim().toLowerCase();
    const codeInput = await rl.question('4-digit code: ');
    const code = normalizeCode(codeInput);

    if (!email) {
      console.error('Admin email is required.');
      process.exitCode = 1;
      return;
    }

    if (!/^\d{4}$/.test(code)) {
      console.error('Code must be exactly 4 digits.');
      process.exitCode = 1;
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        password: true,
        isAdmin: true,
      },
    });

    if (!user) {
      console.error(`No user found for: ${email}`);
      process.exitCode = 1;
      return;
    }

    if (!user.isAdmin) {
      console.error('User exists but is not a staff admin (is_admin is false).');
      process.exitCode = 1;
      return;
    }

    let driver = await prisma.driver.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });

    if (!driver) {
      driver = await prisma.driver.create({
        data: {
          userId: user.id,
          name: user.fullName,
          email: user.email,
          phone: user.phone,
          password: user.password,
          isAvailable: true,
          isActive: true,
        },
        select: { id: true, email: true, name: true },
      });
      console.log(`Created linked driver profile for admin ${driver.email}.`);
    }

    const existingByCode = await prisma.driverVerificationCode.findUnique({
      where: { code },
      select: { driverId: true },
    });
    if (existingByCode && existingByCode.driverId !== driver.id) {
      console.error('That code is already assigned to another account.');
      process.exitCode = 1;
      return;
    }

    await prisma.driverVerificationCode.upsert({
      where: { driverId: driver.id },
      update: {
        code,
        isActive: true,
      },
      create: {
        driverId: driver.id,
        code,
        isActive: true,
      },
    });

    console.log(`Code set for admin ${user.email}: ${code}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    rl.close();
  }
}

void main();
