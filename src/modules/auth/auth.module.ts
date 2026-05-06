import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { SignOptions } from 'jsonwebtoken';
import { AdminDriverVerificationController } from './admin-driver-verification.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DriverVerificationAdminService } from './driver-verification-admin.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { getJwtExpiresIn, getJwtSecret } from './jwt-config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenRevocationService } from './token-revocation.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: {
        expiresIn: getJwtExpiresIn() as SignOptions['expiresIn'],
      },
    }),
  ],
  controllers: [AuthController, AdminDriverVerificationController],
  providers: [
    AuthService,
    DriverVerificationAdminService,
    TokenRevocationService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
