import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Car, type Driver, type User } from '@prisma/client';
import { assertNoUniqueViolation } from '../../common/utils/prisma-error.util';
import {
  hashPassword,
  withoutPassword,
} from '../../common/utils/password.util';
import { PrismaService } from '../../core/database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateCarDto } from './dto/create-car.dto';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateCarDto } from './dto/update-car.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';

type DriverPublic = Omit<Driver, 'password' | 'tokenVersion'>;

export type DriverWithCar = DriverPublic & { car: Car | null };
type DriverProfileUser = Omit<User, 'password' | 'tokenVersion'>;
export type DriverProfile = DriverPublic & {
  car: Car | null;
  user: DriverProfileUser | null;
};

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  private toPublic(driver: Driver): DriverPublic {
    const { tokenVersion: _tv, ...rest } = withoutPassword(driver);
    void _tv;
    return rest;
  }

  async create(dto: CreateDriverDto): Promise<DriverPublic> {
    try {
      const passwordHash = await hashPassword(dto.password);
      const driver = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            fullName: dto.name,
            email: dto.email.toLowerCase(),
            phone: dto.phone,
            password: passwordHash,
            isAdmin: false,
          },
          select: { id: true },
        });

        return tx.driver.create({
          data: {
            userId: user.id,
            name: dto.name,
            email: dto.email.toLowerCase(),
            phone: dto.phone,
            password: passwordHash,
            photoUrl: dto.photoUrl,
            isAvailable: dto.isAvailable ?? true,
            isActive: dto.isActive ?? true,
          },
        });
      });
      return this.toPublic(driver);
    } catch (e) {
      assertNoUniqueViolation(e, 'Email or phone is already registered');
      throw e;
    }
  }

  async findAll(requester: AuthenticatedUser): Promise<DriverWithCar[]> {
    if (requester.typ === 'driver') {
      const driver = await this.prisma.driver.findUnique({
        where: { id: requester.sub },
        include: { car: true },
      });
      if (!driver) {
        throw new NotFoundException(`Driver ${requester.sub} not found`);
      }
      return [{ ...withoutPassword(driver), car: driver.car }];
    }
    const rows = await this.prisma.driver.findMany({
      orderBy: { name: 'asc' },
      include: { car: true },
    });
    return rows.map(({ car, ...row }) => ({
      ...withoutPassword(row),
      car,
    }));
  }

  async findOne(id: string): Promise<DriverWithCar> {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      include: { car: true },
    });
    if (!driver) {
      throw new NotFoundException(`Driver ${id} not found`);
    }
    return { ...withoutPassword(driver), car: driver.car };
  }

  async getMyProfile(requester: AuthenticatedUser): Promise<DriverProfile> {
    if (requester.typ !== 'driver') {
      throw new ForbiddenException('Only drivers can access this endpoint');
    }
    const driver = await this.prisma.driver.findUnique({
      where: { id: requester.sub },
      include: {
        car: true,
        user: true,
      },
    });
    if (!driver) {
      throw new NotFoundException(`Driver ${requester.sub} not found`);
    }
    const { car, user, ...driverRow } = driver;
    const publicDriver = this.toPublic(driverRow);
    const publicUser = user ? withoutPassword(user) : null;
    return {
      ...publicDriver,
      car,
      user: publicUser,
    };
  }

  async update(id: string, dto: UpdateDriverDto): Promise<DriverPublic> {
    await this.findOne(id);
    const data: Prisma.DriverUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.email !== undefined) {
      data.email = dto.email;
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone;
    }
    if (dto.password !== undefined) {
      data.password = await hashPassword(dto.password);
    }
    if (dto.photoUrl !== undefined) {
      data.photoUrl = dto.photoUrl;
    }
    if (dto.isAvailable !== undefined) {
      data.isAvailable = dto.isAvailable;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }
    try {
      const driver = await this.prisma.driver.update({ where: { id }, data });
      return this.toPublic(driver);
    } catch (e) {
      assertNoUniqueViolation(e, 'Email or phone is already in use');
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.driver.delete({ where: { id } });
  }

  async createCar(driverId: string, dto: CreateCarDto): Promise<Car> {
    await this.findOne(driverId);
    const existing = await this.prisma.car.findUnique({
      where: { driverId },
    });
    if (existing) {
      throw new ConflictException(
        `Driver ${driverId} already has a car; update or delete it first`,
      );
    }
    try {
      return await this.prisma.car.create({
        data: {
          driverId,
          carName: dto.carName,
          carNumber: dto.carNumber,
          capacity: dto.capacity,
        },
      });
    } catch (e) {
      assertNoUniqueViolation(e, 'Car number is already registered');
      throw e;
    }
  }

  async getCar(driverId: string): Promise<Car> {
    await this.findOne(driverId);
    const car = await this.prisma.car.findUnique({ where: { driverId } });
    if (!car) {
      throw new NotFoundException(`No car registered for driver ${driverId}`);
    }
    return car;
  }

  async updateCar(driverId: string, dto: UpdateCarDto): Promise<Car> {
    await this.getCar(driverId);
    try {
      return await this.prisma.car.update({
        where: { driverId },
        data: dto,
      });
    } catch (e) {
      assertNoUniqueViolation(e, 'Car number is already in use');
      throw e;
    }
  }

  async removeCar(driverId: string): Promise<void> {
    await this.getCar(driverId);
    await this.prisma.car.delete({ where: { driverId } });
  }
}
