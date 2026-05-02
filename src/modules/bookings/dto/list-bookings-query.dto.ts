import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/** When set, filters and orders the list for driver/passenger trip timelines. Omit for an unfiltered list (newest first by `createdAt`). */
export enum BookingTimeScope {
  Past = 'past',
  Current = 'current',
  Upcoming = 'upcoming',
}

export class ListBookingsQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    default: 1,
    minimum: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Number of bookings per page',
    default: 20,
    minimum: 1,
    maximum: 100,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({
    enum: BookingTimeScope,
    description:
      '`past`: completed or cancelled. `current`: active or overdue (not terminal). `upcoming`: scheduled from now onward (not terminal). Omit to list all bookings ordered by `createdAt` (newest first).',
  })
  @IsOptional()
  @IsEnum(BookingTimeScope)
  timeScope?: BookingTimeScope;
}
