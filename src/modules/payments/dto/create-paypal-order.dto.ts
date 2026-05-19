import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePayPalOrderDto {
  @ApiProperty({ example: 52, description: 'Fare amount in EUR' })
  @IsNumber()
  @Min(0.5)
  amountEur!: number;

  @ApiPropertyOptional({ example: 'Taxi: Airport → Hotel' })
  @IsOptional()
  @IsString()
  @MaxLength(127)
  description?: string;

  @ApiPropertyOptional({
    description:
      'Where PayPal sends the buyer after approval (required for PayPal login / mobile redirect).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  returnUrl?: string;

  @ApiPropertyOptional({ description: 'Where PayPal sends the buyer if they cancel checkout.' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cancelUrl?: string;
}
