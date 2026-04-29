import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class SigninDto {
  @ApiProperty({ example: 'you@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'your-password' })
  @IsString()
  @MinLength(1)
  password!: string;
}

export class LoginResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  access_token!: string;

  @ApiProperty({
    description: 'Seconds remaining until the token expires',
    example: 604800,
  })
  expires_in!: number;

  @ApiProperty({
    description: 'Absolute expiry instant (ISO 8601)',
    example: '2026-05-01T12:00:00.000Z',
  })
  expires_at!: string;
}

export class SignoutResponseDto {
  @ApiProperty({
    description:
      'True if this access token was revoked server-side until expiry. False if no `Authorization` header was sent, or the token has no `jti` (issued before signout support) — still remove the token on the client.',
  })
  revoked!: boolean;
}
