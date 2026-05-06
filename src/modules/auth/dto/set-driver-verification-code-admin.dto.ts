import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, Matches } from 'class-validator';

export class SetDriverVerificationCodeAdminDto {
  @ApiProperty({ example: 'driver@example.com' })
  @IsEmail()
  driverEmail!: string;

  @ApiProperty({
    description: '4-digit numeric code unique across drivers',
    example: '4829',
  })
  @IsString()
  @Matches(/^\d{4}$/, { message: 'Code must be exactly 4 digits' })
  code!: string;

  @ApiPropertyOptional({
    description: 'When false, the code remains stored but cannot be used until re-enabled',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
