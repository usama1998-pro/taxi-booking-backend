import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CapturePayPalOrderDto {
  @ApiProperty({ description: 'PayPal order ID returned after buyer approval' })
  @IsString()
  @MinLength(1)
  orderId!: string;
}
