import { Injectable } from '@nestjs/common';

/**
 * In-memory revoked access-token `jti` values until their JWT `exp`.
 * Survives only for this process (use Redis etc. for multi-instance).
 */
@Injectable()
export class TokenRevocationService {
  private readonly revokedJtiUntilExp = new Map<string, number>();

  revokeUntil(jti: string, expUnixSec: number): void {
    this.revokedJtiUntilExp.set(jti, expUnixSec);
    this.pruneExpired();
  }

  isRevoked(jti: string | undefined): boolean {
    if (!jti) {
      return false;
    }
    const exp = this.revokedJtiUntilExp.get(jti);
    if (exp == null) {
      return false;
    }
    const now = Math.floor(Date.now() / 1000);
    if (now >= exp) {
      this.revokedJtiUntilExp.delete(jti);
      return false;
    }
    return true;
  }

  private pruneExpired(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [jti, exp] of this.revokedJtiUntilExp) {
      if (now >= exp) {
        this.revokedJtiUntilExp.delete(jti);
      }
    }
  }
}
