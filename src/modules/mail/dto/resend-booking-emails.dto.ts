import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ResendBookingEmailsDto {
  @ApiProperty({
    description: 'Booking uuid to resend customer confirmation and owner alert emails for.',
  })
  @IsUUID()
  bookingUuid!: string;
}
