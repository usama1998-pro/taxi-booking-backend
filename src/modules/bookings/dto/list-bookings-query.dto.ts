import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

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
      '`past`: completed or cancelled, ordered by `completedAt` then `createdAt` (newest first). `current`: not terminal and pickup before tomorrow (today + overdue), soonest `scheduledTime` first. `upcoming`: not terminal and `scheduledTime` from tomorrow onward, soonest `scheduledTime` first.',
  })
  @IsOptional()
  @IsEnum(BookingTimeScope)
  timeScope?: BookingTimeScope;

  @ApiPropertyOptional({
    description:
      'Filter by pickup calendar day in server `TZ` (e.g. Europe/Madrid). `YYYY-MM-DD`. Combined with `timeScope` when set.',
    example: '2026-09-17',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  scheduledOn?: string;
}
