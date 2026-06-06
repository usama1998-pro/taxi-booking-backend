import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBookingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiPropertyOptional({
    description:
      'Unique customer-facing reference (e.g. PNR). If omitted, the server assigns one.',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bookingReference?: string;

  @ApiProperty({
    example: { lat: 40.7128, lng: -74.006, label: 'Pickup' },
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  @IsNotEmpty()
  pickupLocation!: Record<string, unknown>;

  @ApiProperty({
    example: { lat: 40.7589, lng: -73.9851, label: 'Dropoff' },
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  @IsNotEmpty()
  dropoffLocation!: Record<string, unknown>;

  @ApiProperty({ example: '2026-05-01T14:00:00.000Z' })
  @IsISO8601()
  scheduledTime!: string;

  @ApiProperty({ example: 42.5 })
  @IsNumber()
  price!: number;

  @ApiProperty({ example: 'PENDING' })
  @IsString()
  status!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  @Max(50)
  luggageCount!: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  @Max(20)
  passengerCount!: number;

  @ApiPropertyOptional({
    example: 0,
    description: 'Infant carrier (0–6 months)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  infantCarrierCount?: number;

  @ApiPropertyOptional({
    example: 0,
    description: 'Child seat (6 months – 3 years)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  childSeatCount?: number;

  @ApiPropertyOptional({ example: 0, description: 'Booster (3–12 years)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  boosterCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  flightNumber?: string;

  @ApiPropertyOptional({ example: '2026-05-02T11:30:00.000Z' })
  @IsOptional()
  @IsISO8601()
  returnTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
