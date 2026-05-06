import 'dotenv/config';
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
    const email = (await rl.question('Driver email: ')).trim().toLowerCase();
    const codeInput = await rl.question('4-digit verification code: ');
    const code = normalizeCode(codeInput);

    if (!email) {
      console.error('Driver email is required.');
      process.exitCode = 1;
      return;
    }
    if (!/^\d{4}$/.test(code)) {
      console.error('Code must be exactly 4 digits.');
      process.exitCode = 1;
      return;
    }

    const driver = await prisma.driver.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });
    if (!driver) {
      console.error(`No driver account found for: ${email}`);
      process.exitCode = 1;
      return;
    }

    const existingByCode = await prisma.driverVerificationCode.findUnique({
      where: { code },
      select: { driverId: true },
    });
    if (existingByCode && existingByCode.driverId !== driver.id) {
      console.error('That code is already assigned to another driver.');
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

    console.log(`Verification code set for ${driver.name} <${driver.email}>: ${code}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    rl.close();
  }
}

void main();
