import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class PatchDriverVerificationCodeAdminDto {
  @ApiProperty({
    description: 'Whether this driver code may be used for app login',
  })
  @IsBoolean()
  isActive!: boolean;
}
