/**
 * E2E runs without loading `.env`; align with `.env.example` so core services resolve a URL.
 */
process.env.TZ ??= 'Europe/Madrid';

process.env.DATABASE_USER ??= 'taxi';
process.env.DATABASE_PASSWORD ??= 'taxi';
process.env.DATABASE_NAME ??= 'taxi_booking';
process.env.DATABASE_HOST ??= 'localhost';
process.env.DATABASE_PORT ??= '3306';

process.env.JWT_SECRET ??= 'e2e-test-jwt-secret-do-not-use-in-production';
process.env.JWT_EXPIRES_IN ??= '1h';

process.env.GOOGLE_MAPS_API_KEY ??= 'e2e-test-google-maps-key';
