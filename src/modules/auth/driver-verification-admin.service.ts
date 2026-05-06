import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class DriverVerificationAdminService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeCode(raw: string): string {
    return raw.replace(/\D/g, '').slice(0, 4);
  }

  async setForDriverEmail(input: {
    driverEmail: string;
    code: string;
    isActive?: boolean;
  }) {
    const email = input.driverEmail.trim().toLowerCase();
    const code = this.normalizeCode(input.code);
    if (!/^\d{4}$/.test(code)) {
      throw new BadRequestException('Code must be exactly 4 digits');
    }
    const driver = await this.prisma.driver.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found for that email');
    }
    const taken = await this.prisma.driverVerificationCode.findUnique({
      where: { code },
      select: { driverId: true },
    });
    if (taken && taken.driverId !== driver.id) {
      throw new ConflictException(
        'That code is already assigned to another driver',
      );
    }
    const isActive = input.isActive ?? true;
    const row = await this.prisma.driverVerificationCode.upsert({
      where: { driverId: driver.id },
      update: { code, isActive },
      create: { driverId: driver.id, code, isActive },
    });
    return {
      driverId: driver.id,
      driverEmail: driver.email,
      driverName: driver.name,
      code: row.code,
      isActive: row.isActive,
    };
  }

  async setActive(driverId: string, isActive: boolean) {
    const row = await this.prisma.driverVerificationCode.findUnique({
      where: { driverId },
    });
    if (!row) {
      throw new NotFoundException(
        'No verification code configured for this driver',
      );
    }
    return this.prisma.driverVerificationCode.update({
      where: { driverId },
      data: { isActive },
      select: { driverId: true, code: true, isActive: true },
    });
  }

  async remove(driverId: string) {
    const deleted = await this.prisma.driverVerificationCode.deleteMany({
      where: { driverId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException(
        'No verification code configured for this driver',
      );
    }
    return { deleted: true as const };
  }
}
