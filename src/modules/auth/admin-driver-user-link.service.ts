import { Injectable, NotFoundException } from '@nestjs/common';
import { withoutPassword } from '../../common/utils/password.util';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class AdminDriverUserLinkService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sets `Driver.userId` so the driver app profile is tied to an existing `User` row
   * (staff super admin, dispatcher, or a passenger user). At most one driver may use a given `userId`.
   */
  async assignLinkedUser(driverId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException(`User ${userId} not found`);
      }
      const driver = await tx.driver.findUnique({
        where: { id: driverId },
        include: { car: true },
      });
      if (!driver) {
        throw new NotFoundException(`Driver ${driverId} not found`);
      }

      const otherDriverWithThisUser = await tx.driver.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (otherDriverWithThisUser && otherDriverWithThisUser.id !== driverId) {
        await tx.driver.update({
          where: { id: otherDriverWithThisUser.id },
          data: { userId: null },
        });
      }

      const updated = await tx.driver.update({
        where: { id: driverId },
        data: { userId },
        include: { car: true },
      });

      const { car, ...row } = updated;
      return { ...withoutPassword(row), car };
    });
  }

  async clearLinkedUser(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { car: true },
    });
    if (!driver) {
      throw new NotFoundException(`Driver ${driverId} not found`);
    }
    if (!driver.userId) {
      const { car, ...row } = driver;
      return { ...withoutPassword(row), car };
    }
    const updated = await this.prisma.driver.update({
      where: { id: driverId },
      data: { userId: null },
      include: { car: true },
    });
    const { car, ...row } = updated;
    return { ...withoutPassword(row), car };
  }
}
