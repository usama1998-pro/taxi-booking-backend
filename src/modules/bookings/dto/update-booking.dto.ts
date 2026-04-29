import { OmitType, PartialType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { CreateBookingDto } from './create-booking.dto';

class UpdateBookingWithoutDriver extends PartialType(
  OmitType(CreateBookingDto, ['driverId'] as const),
) {}

export class UpdateBookingDto extends UpdateBookingWithoutDriver {
  @ApiPropertyOptional({
    nullable: true,
    description: 'Set to null to unassign the driver.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsUUID()
  driverId?: string | null;
}
