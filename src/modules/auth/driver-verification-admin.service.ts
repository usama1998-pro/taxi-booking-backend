import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { assertNoUniqueViolation } from '../../common/utils/prisma-error.util';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class DriverVerificationAdminService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeCode(raw: string): string {
    return raw.replace(/\D/g, '').slice(0, 4);
  }

  /** Driver must already exist (e.g. delete-by-email). */
  private async findDriverByEmailStrict(driverEmail: string) {
    const email = driverEmail.trim().toLowerCase();
    const driver = await this.prisma.driver.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });
    if (!driver) {
      throw new NotFoundException('Driver not found for that email');
    }
    return driver;
  }

  /**
   * For setting/updating codes: use existing driver, or create a `Driver` row from a `User` with
   * the same email (passenger or staff) so a code can be stored. Staff password sign-in still
   * prefers the staff `User` when both rows share the email (see `AuthService.signin`).
   */
  private async findDriverOrProvisionFromUser(driverEmail: string) {
    const email = driverEmail.trim().toLowerCase();
    const existing = await this.prisma.driver.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });
    if (existing) {
      return existing;
    }
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        password: true,
      },
    });
    if (!user) {
      throw new NotFoundException(
        'No driver or user found for that email',
      );
    }
    try {
      const created = await this.prisma.driver.create({
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
      return created;
    } catch (e) {
      assertNoUniqueViolation(
        e,
        'Cannot create driver profile for this user: email or phone already used on another driver',
      );
      throw e;
    }
  }

  async setForDriverEmail(input: {
    driverEmail: string;
    code: string;
    isActive?: boolean;
  }) {
    const code = this.normalizeCode(input.code);
    if (!/^\d{4}$/.test(code)) {
      throw new BadRequestException('Code must be exactly 4 digits');
    }
    const driver = await this.findDriverOrProvisionFromUser(
      input.driverEmail,
    );
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

  async updateForDriverEmail(input: {
    driverEmail: string;
    code?: string;
    isActive?: boolean;
  }) {
    const driver = await this.findDriverOrProvisionFromUser(
      input.driverEmail,
    );
    const existing = await this.prisma.driverVerificationCode.findUnique({
      where: { driverId: driver.id },
      select: { driverId: true },
    });
    if (!existing) {
      if (input.code === undefined) {
        throw new BadRequestException(
          'No verification code yet for this driver; send a 4-digit code (or use POST to set one).',
        );
      }
      return this.setForDriverEmail({
        driverEmail: input.driverEmail,
        code: input.code,
        isActive: input.isActive,
      });
    }

    const nextCode =
      input.code !== undefined ? this.normalizeCode(input.code) : undefined;
    if (nextCode !== undefined && !/^\d{4}$/.test(nextCode)) {
      throw new BadRequestException('Code must be exactly 4 digits');
    }
    if (nextCode === undefined && input.isActive === undefined) {
      throw new BadRequestException('Provide code and/or isActive to update');
    }
    if (nextCode !== undefined) {
      const taken = await this.prisma.driverVerificationCode.findUnique({
        where: { code: nextCode },
        select: { driverId: true },
      });
      if (taken && taken.driverId !== driver.id) {
        throw new ConflictException(
          'That code is already assigned to another driver',
        );
      }
    }

    const row = await this.prisma.driverVerificationCode.update({
      where: { driverId: driver.id },
      data: {
        ...(nextCode !== undefined ? { code: nextCode } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: { driverId: true, code: true, isActive: true },
    });
    return {
      driverId: row.driverId,
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

  async removeByDriverEmail(driverEmail: string) {
    const driver = await this.findDriverByEmailStrict(driverEmail);
    return this.remove(driver.id);
  }
}
