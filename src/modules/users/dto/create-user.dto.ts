import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  fullName!: string;

  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '+15551234567' })
  @IsString()
  phone!: string;

  @ApiProperty({ example: 'secretpass123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}
