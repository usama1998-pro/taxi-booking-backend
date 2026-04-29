import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../core/database/prisma.service';
import type { AuthenticatedUser, JwtPayload } from '../auth.types';
import { getJwtSecret } from '../jwt-config';
import { TokenRevocationService } from '../token-revocation.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private static extractBearerToken(
    req: { headers?: Record<string, unknown> } | undefined,
  ): string | null {
    if (!req?.headers) {
      return null;
    }
    const raw = req.headers['authorization'];
    const value =
      typeof raw === 'string'
        ? raw
        : Array.isArray(raw) && raw.length > 0
          ? raw[0]
          : null;
    if (!value) {
      return null;
    }
    const first = value.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
    if (!first) {
      return null;
    }
    // Tolerate accidental "Bearer <token>" pasted into Swagger Authorize.
    const second = first.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
    return second || first;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenRevocation: TokenRevocationService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        JwtStrategy.extractBearerToken,
      ]),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(
    payload: JwtPayload & { exp?: number; iat?: number },
  ): Promise<AuthenticatedUser> {
    if (!payload?.sub || !payload?.email || !payload?.typ) {
      throw new UnauthorizedException();
    }
    if (payload.typ !== 'user' && payload.typ !== 'driver') {
      throw new UnauthorizedException();
    }
    if (typeof payload.is_admin !== 'boolean') {
      throw new UnauthorizedException();
    }
    const rawJti: unknown = (payload as { jti?: unknown }).jti;
    const jti: string | undefined =
      typeof rawJti === 'string' ? rawJti : undefined;
    if (this.tokenRevocation.isRevoked(jti)) {
      throw new UnauthorizedException('Token has been revoked');
    }
    const rawTv: unknown = (payload as { tv?: unknown }).tv;
    const tv =
      typeof rawTv === 'number' &&
      Number.isFinite(rawTv) &&
      rawTv >= 0 &&
      Number.isInteger(rawTv)
        ? rawTv
        : null;
    if (tv === null) {
      throw new UnauthorizedException('Invalid token');
    }
    if (payload.typ === 'driver') {
      if (payload.is_admin) {
        throw new UnauthorizedException();
      }
      const driver = await this.prisma.driver.findUnique({
        where: { id: payload.sub },
        select: { isActive: true, tokenVersion: true },
      });
      if (!driver || !driver.isActive) {
        throw new UnauthorizedException('Driver account is disabled');
      }
      if (driver.tokenVersion !== tv) {
        throw new UnauthorizedException(
          'Token is no longer valid; sign in again',
        );
      }
    }
    if (payload.typ === 'user') {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { isAdmin: true, tokenVersion: true },
      });
      if (!user?.isAdmin || !payload.is_admin) {
        throw new UnauthorizedException('Admin account not found');
      }
      if (user.tokenVersion !== tv) {
        throw new UnauthorizedException(
          'Token is no longer valid; sign in again',
        );
      }
    }
    const exp = payload.exp;
    if (typeof exp !== 'number') {
      throw new UnauthorizedException();
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const expires_in = Math.max(0, exp - nowSec);
    const expires_at = new Date(exp * 1000).toISOString();
    return {
      sub: payload.sub,
      email: payload.email,
      typ: payload.typ,
      is_admin: payload.is_admin,
      tv,
      jti,
      exp,
      iat: payload.iat,
      expires_in,
      expires_at,
    };
  }
}
