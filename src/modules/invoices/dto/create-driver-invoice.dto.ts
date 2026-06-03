import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceAddressKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateDriverInvoiceDto {
  @ApiProperty({ example: 'Jane Passenger' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName!: string;

  @ApiProperty({ example: '+44 7700 900000' })
  @IsString()
  @MinLength(5)
  @MaxLength(40)
  phoneNumber!: string;

  @ApiProperty({ description: 'Customer-facing booking reference text' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  bookingReference!: string;

  @ApiProperty({ description: 'ISO 8601 date-time for pickup' })
  @IsDateString()
  pickupDate!: string;

  @ApiProperty({ enum: InvoiceAddressKind })
  @IsEnum(InvoiceAddressKind)
  pickupKind!: InvoiceAddressKind;

  @ApiPropertyOptional({
    description: 'When pickupKind is LOCATION: optional street / meeting point.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pickupAddress?: string;

  @ApiPropertyOptional({
    description: 'When pickupKind is AIRPORT: optional airline name or code.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  pickupAirline?: string;

  @ApiPropertyOptional({
    description: 'When pickupKind is AIRPORT: optional flight number.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  pickupFlightNo?: string;

  @ApiProperty({ enum: InvoiceAddressKind })
  @IsEnum(InvoiceAddressKind)
  dropoffKind!: InvoiceAddressKind;

  @ApiPropertyOptional({
    description: 'When dropoffKind is LOCATION: optional street / meeting point.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  dropoffAddress?: string;

  @ApiPropertyOptional({
    description: 'When dropoffKind is AIRPORT: optional airline name or code.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  dropoffAirline?: string;

  @ApiPropertyOptional({
    description: 'When dropoffKind is AIRPORT: optional flight number.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  dropoffFlightNo?: string;

  @ApiProperty({ example: 2, minimum: 1, maximum: 25 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  passengerCount!: number;

  @ApiProperty({
    description:
      'Gross subtotal (GBP). Tax is always 10%; `totalAmount` is subtotal minus that tax (e.g. 100 → 90).',
    example: 45.0,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceAmount!: number;

  @ApiPropertyOptional({
    description:
      'Optional line for child seats on the invoice. If omitted and the booking reference matches an assigned booking with child seats, the server fills this automatically.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  childSeatsSummary?: string;
}
