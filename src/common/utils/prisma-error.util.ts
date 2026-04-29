import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function assertNoUniqueViolation(
  error: unknown,
  message = 'A record with this value already exists',
): void {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException(message);
  }
}
