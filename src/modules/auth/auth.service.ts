import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { hashPassword } from '../../common/utils/password.util';
import { PrismaService } from '../../core/database/prisma.service';
import type {
  AuthenticatedUser,
  JwtPayload,
  LoginResponse,
} from './auth.types';
import { SigninDto } from './dto/signin.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenRevocationService } from './token-revocation.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly jwtStrategy: JwtStrategy,
    private readonly tokenRevocation: TokenRevocationService,
  ) {}

  private async signAccessToken(
    payload: Omit<JwtPayload, 'jti' | 'tv'> & { tv: number },
  ): Promise<LoginResponse> {
    const access_token = await this.jwtService.signAsync({
      ...payload,
      jti: randomUUID(),
    } satisfies JwtPayload);
    const decoded = this.jwtService.decode<{ exp?: number }>(access_token);
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      typeof decoded.exp !== 'number'
    ) {
      throw new InternalServerErrorException(
        'Signed token is missing an exp claim; check JWT module signOptions.expiresIn',
      );
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const expires_in = Math.max(0, decoded.exp - nowSec);
    const expires_at = new Date(decoded.exp * 1000).toISOString();
    return { access_token, expires_in, expires_at };
  }

  async signin(dto: SigninDto): Promise<LoginResponse> {
    const email = dto.email.trim().toLowerCase();
    const [user, driver] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.prisma.driver.findUnique({ where: { email } }),
    ]);

    if (
      user?.isAdmin &&
      (await bcrypt.compare(dto.password, user.password))
    ) {
      const { tokenVersion } = await this.prisma.user.update({
        where: { id: user.id },
        data: { tokenVersion: { increment: 1 } },
        select: { tokenVersion: true },
      });
      return this.signAccessToken({
        sub: user.id,
        email: user.email,
        typ: 'user',
        is_admin: true,
        is_super_admin: user.isSuperAdmin,
        tv: tokenVersion,
      });
    }

    if (driver) {
      if (!(await bcrypt.compare(dto.password, driver.password))) {
        throw new UnauthorizedException('Invalid email or password');
      }
      if (!driver.isActive) {
        throw new UnauthorizedException('Driver account is disabled');
      }
      const { tokenVersion } = await this.prisma.driver.update({
        where: { id: driver.id },
        data: { tokenVersion: { increment: 1 } },
        select: { tokenVersion: true },
      });
      return this.signAccessToken({
        sub: driver.id,
        email: driver.email,
        typ: 'driver',
        is_admin: false,
        tv: tokenVersion,
      });
    }

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    throw new UnauthorizedException(
      'Passenger accounts cannot sign in here; use npm run create-admin for staff accounts',
    );
  }

  async verifyCode(dto: VerifyCodeDto): Promise<LoginResponse> {
    const code = dto.code.trim();
    const match = await this.prisma.driverVerificationCode.findUnique({
      where: { code },
      include: {
        driver: {
          select: {
            id: true,
            email: true,
            isActive: true,
          },
        },
      },
    });
    if (!match || !match.isActive) {
      throw new UnauthorizedException('Invalid verification code');
    }
    if (!match.driver.isActive) {
      throw new UnauthorizedException('Driver account is disabled');
    }
    const { tokenVersion } = await this.prisma.driver.update({
      where: { id: match.driver.id },
      data: { tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });
    return this.signAccessToken({
      sub: match.driver.id,
      email: match.driver.email,
      typ: 'driver',
      is_admin: false,
      tv: tokenVersion,
    });
  }

  private extractAccessToken(
    authorization: string | string[] | undefined,
  ): string | null {
    if (authorization == null) {
      return null;
    }
    const raw = Array.isArray(authorization) ? authorization[0] : authorization;
    if (typeof raw !== 'string') {
      return null;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }
    const bearer = trimmed.match(/^Bearer\s+(.+)$/i);
    if (bearer?.[1]) {
      return bearer[1].trim();
    }
    if (trimmed.includes('.') && trimmed.split('.').length === 3) {
      return trimmed;
    }
    return null;
  }

  async verifyBearer(
    authorization: string | string[] | undefined,
  ): Promise<AuthenticatedUser> {
    const token = this.extractAccessToken(authorization);
    if (!token) {
      throw new UnauthorizedException(
        'Missing access token: send Authorization: Bearer <access_token>, or in Swagger use Authorize and paste only the token.',
      );
    }
    let payload: JwtPayload & { exp?: number; iat?: number };
    try {
      payload = await this.jwtService.verifyAsync<
        JwtPayload & { exp?: number; iat?: number }
      >(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return this.jwtStrategy.validate(payload);
  }

  async signout(
    authorization: string | string[] | undefined,
  ): Promise<{ revoked: boolean }> {
    const token = this.extractAccessToken(authorization);
    if (!token) {
      return { revoked: false };
    }
    try {
      const payload = await this.jwtService.verifyAsync<
        JwtPayload & { exp?: number }
      >(token);
      const { jti, exp } = payload;
      if (typeof exp === 'number' && typeof jti === 'string') {
        this.tokenRevocation.revokeUntil(jti, exp);
        return { revoked: true };
      }
      return { revoked: false };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async signup(dto: SignupDto): Promise<LoginResponse> {
    const passwordHash = await hashPassword(dto.password);
    const driver = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          fullName: dto.name,
          email: dto.email.toLowerCase(),
          phone: dto.phone,
          password: passwordHash,
          isAdmin: false,
        },
        select: { id: true },
      });

      return tx.driver.create({
        data: {
          userId: user.id,
          name: dto.name,
          email: dto.email.toLowerCase(),
          phone: dto.phone,
          password: passwordHash,
          photoUrl: dto.photoUrl,
          isAvailable: dto.isAvailable ?? true,
          isActive: true,
        },
      });
    });
    return this.signAccessToken({
      sub: driver.id,
      email: driver.email,
      typ: 'driver',
      is_admin: false,
      tv: 0,
    });
  }
}
