import 'dotenv/config';

/** Barcelona / Spain — CET/CEST. Override with `TZ` in `.env` if needed. */
const DEFAULT_TZ = 'Europe/Madrid';

const raw = process.env.TZ?.trim();
process.env.TZ = raw && raw.length > 0 ? raw : DEFAULT_TZ;
