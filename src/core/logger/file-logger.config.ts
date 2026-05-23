import { mkdirSync } from 'node:fs';
import path from 'node:path';

export type FileLoggerConfig = {
  enabled: boolean;
  filePath: string;
  maxSizeBytes: number;
  maxFiles: number;
  console: boolean;
  level: string;
};

const DEFAULT_FILE = 'logs/app.log';
const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5;

function parseBoolean(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw.trim() === '') {
    return defaultValue;
  }
  const v = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(v)) {
    return false;
  }
  return defaultValue;
}

function parseMaxSizeBytes(raw: string | undefined): number {
  if (!raw?.trim()) {
    return DEFAULT_MAX_SIZE_BYTES;
  }
  const text = raw.trim().toLowerCase();
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) {
    const n = Number(text);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_SIZE_BYTES;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return DEFAULT_MAX_SIZE_BYTES;
  }
  const unit = match[2] ?? 'b';
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };
  return Math.floor(amount * (multipliers[unit] ?? 1));
}

export function resolveFileLoggerConfig(): FileLoggerConfig {
  const filePath = path.resolve(
    process.cwd(),
    process.env.LOG_FILE?.trim() || DEFAULT_FILE,
  );
  const maxFilesRaw = process.env.LOG_FILE_MAX_FILES?.trim();
  const maxFilesParsed = maxFilesRaw ? Number(maxFilesRaw) : DEFAULT_MAX_FILES;

  return {
    enabled: parseBoolean(process.env.LOG_FILE_ENABLED, true),
    filePath,
    maxSizeBytes: parseMaxSizeBytes(process.env.LOG_FILE_MAX_SIZE),
    maxFiles:
      Number.isFinite(maxFilesParsed) && maxFilesParsed >= 1
        ? Math.floor(maxFilesParsed)
        : DEFAULT_MAX_FILES,
    console: parseBoolean(
      process.env.LOG_CONSOLE,
      process.env.NODE_ENV !== 'production',
    ),
    level: process.env.LOG_LEVEL?.trim().toLowerCase() || 'info',
  };
}

export function ensureLogDirectory(filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
}
