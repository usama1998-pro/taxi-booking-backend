import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/** When set, filters the list for driver/passenger trip timelines. Omit `timeScope` for an unfiltered list (`createdAt` desc). */
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
      '`past`: completed or cancelled, ordered by `completedAt` then `createdAt` (newest first). `current`: status `in_progress`, `createdAt` desc. `upcoming`: not terminal and not `in_progress` (e.g. pending, assigned), soonest `scheduledTime` first.',
  })
  @IsOptional()
  @IsEnum(BookingTimeScope)
  timeScope?: BookingTimeScope;
}
