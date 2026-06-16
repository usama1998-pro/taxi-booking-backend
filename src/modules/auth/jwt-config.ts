export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  return 'dev-only-change-in-production';
}

export function getJwtExpiresIn(): string {
  // Long-lived by default so sessions persist across app restarts/devices.
  // Explicit signout still revokes the active token via jti revocation.
  return process.env.JWT_EXPIRES_IN?.trim() || '100y';
}
