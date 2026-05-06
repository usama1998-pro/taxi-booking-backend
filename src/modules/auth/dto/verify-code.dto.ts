import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class VerifyCodeDto {
  @ApiProperty({
    description: '4-digit code configured for a driver account',
    example: '1234',
  })
  @IsString()
  @Matches(/^\d{4}$/, { message: 'Code must be exactly 4 digits' })
  code!: string;
}
