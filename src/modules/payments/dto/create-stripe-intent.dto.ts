import { IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateStripeIntentDto {
  @ApiProperty({ example: 52, description: 'Fare amount in EUR' })
  @IsNumber()
  @Min(0.5)
  amountEur!: number;
}
