import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class PatchMyAvailabilityDto {
  @ApiProperty({
    description: 'When true, the driver can receive new booking assignments.',
    example: true,
  })
  @IsBoolean()
  isAvailable!: boolean;
}
