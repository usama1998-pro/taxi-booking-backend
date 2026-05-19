import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsUUID } from 'class-validator';

export class SendBookingEmailDto {
  @ApiProperty({ example: 'passenger@example.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({
    description:
      'Optional booking uuid to include trip details in the email. If omitted, sends a generic confirmation.',
  })
  @IsOptional()
  @IsUUID()
  bookingUuid?: string;
}
