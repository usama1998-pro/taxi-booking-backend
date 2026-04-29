/**
 * E2E runs without loading `.env`; align with `.env.example` so core services resolve a URL.
 */
process.env.DATABASE_USER ??= 'taxi';
process.env.DATABASE_PASSWORD ??= 'taxi';
process.env.DATABASE_NAME ??= 'taxi_booking';
process.env.DATABASE_HOST ??= 'localhost';
process.env.DATABASE_PORT ??= '5432';

process.env.JWT_SECRET ??= 'e2e-test-jwt-secret-do-not-use-in-production';
process.env.JWT_EXPIRES_IN ??= '1h';
