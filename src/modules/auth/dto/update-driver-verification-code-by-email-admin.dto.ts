import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateDriverVerificationCodeByEmailAdminDto {
  @ApiProperty({ example: 'driver@example.com' })
  @IsEmail()
  driverEmail!: string;

  @ApiPropertyOptional({
    description: 'New 4-digit numeric code unique across drivers',
    example: '4829',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'Code must be exactly 4 digits' })
  code?: string;

  @ApiPropertyOptional({
    description: 'Enable/disable existing code',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
