import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { assertNoUniqueViolation } from '../../common/utils/prisma-error.util';
import {
  hashPassword,
  withoutPassword,
} from '../../common/utils/password.util';
import { PrismaService } from '../../core/database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

type UserPublic = Omit<User, 'password'>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private toPublic(user: User): UserPublic {
    return withoutPassword(user);
  }

  async create(dto: CreateUserDto): Promise<UserPublic> {
    try {
      const user = await this.prisma.user.create({
        data: {
          fullName: dto.fullName,
          email: dto.email,
          phone: dto.phone,
          password: await hashPassword(dto.password),
        },
      });
      return this.toPublic(user);
    } catch (e) {
      assertNoUniqueViolation(e, 'Email or phone is already registered');
      throw e;
    }
  }

  async findAll(requester: AuthenticatedUser): Promise<UserPublic[]> {
    if (requester.is_admin) {
      const rows = await this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return rows.map((row) => this.toPublic(row));
    }
    if (requester.typ === 'driver') {
      throw new ForbiddenException('Drivers cannot list users');
    }
    const row = await this.prisma.user.findUnique({
      where: { id: requester.sub },
    });
    if (!row) {
      throw new NotFoundException(`User ${requester.sub} not found`);
    }
    return [this.toPublic(row)];
  }

  async findOne(id: string): Promise<UserPublic> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return this.toPublic(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserPublic> {
    await this.findOne(id);
    const data: Prisma.UserUpdateInput = {};
    if (dto.fullName !== undefined) {
      data.fullName = dto.fullName;
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
    try {
      const user = await this.prisma.user.update({ where: { id }, data });
      return this.toPublic(user);
    } catch (e) {
      assertNoUniqueViolation(e, 'Email or phone is already in use');
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
  }
}
