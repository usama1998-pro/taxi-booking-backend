/** Which entity `sub` refers to in the database (`User` vs `Driver`). */
export type JwtPrincipalKind = 'user' | 'driver';

/** Claims we put in the JWT (`sub`, `email`, `typ`, `is_admin`, `tv`, `jti`). `exp` / `iat` are added by the library. */
export interface JwtPayload {
  sub: string;
  email: string;
  typ: JwtPrincipalKind;
  /** Always `false` for drivers. Staff logins use `User` rows with `isAdmin` in the database. */
  is_admin: boolean;
  /** Matches `User.tokenVersion` / `Driver.tokenVersion`; incremented on each signin to invalidate older JWTs. */
  tv?: number;
  /** Session id for server-side signout (revocation) until `exp` (new tokens only). */
  jti?: string;
  exp?: number;
  iat?: number;
}

/** Attached to `request.user` after validation (includes client-friendly expiry). */
export type AuthenticatedUser = JwtPayload & {
  expires_in: number;
  expires_at: string;
};

export interface LoginResponse {
  access_token: string;
  /** Seconds until `exp` (from JWT `exp` claim, relative to response time). */
  expires_in: number;
  /** When the token expires (ISO 8601). */
  expires_at: string;
}
