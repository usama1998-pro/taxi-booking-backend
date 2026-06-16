import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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
      '`past`: completed/cancelled OR open bookings scheduled before today, newest first. `current`: open bookings scheduled today only, soonest `scheduledTime` first. `upcoming`: open bookings from tomorrow onward, soonest `scheduledTime` first. With `scheduledOn`, returns trips on that calendar day in server `TZ`.',
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

  @ApiPropertyOptional({
    description:
      'Partial match on `bookingReference` (case-insensitive). When set, `timeScope` is ignored so a ref can be found regardless of tab.',
    example: 'BR-1399',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  bookingReference?: string;
}
