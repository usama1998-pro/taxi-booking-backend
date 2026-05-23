import { ConsoleLogger, type LoggerService } from '@nestjs/common';
import type winston from 'winston';

import { getSharedWinstonLogger } from './create-winston-logger';
import { resolveFileLoggerConfig } from './file-logger.config';

function formatMessage(message: unknown): string {
  if (typeof message === 'string') {
    return message;
  }
  if (message instanceof Error) {
    return message.message;
  }
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

function extractContext(optionalParams: unknown[]): string | undefined {
  if (optionalParams.length === 0) {
    return undefined;
  }
  const last = optionalParams[optionalParams.length - 1];
  return typeof last === 'string' ? last : undefined;
}

function extractStack(message: unknown): string | undefined {
  return message instanceof Error ? message.stack : undefined;
}

export class NestWinstonLogger extends ConsoleLogger implements LoggerService {
  private readonly winston: winston.Logger;

  constructor(context = 'Application') {
    super(context);
    this.winston = getSharedWinstonLogger();
  }

  private write(
    level: 'info' | 'error' | 'warn' | 'debug' | 'verbose',
    message: unknown,
    optionalParams: unknown[],
  ): void {
    const context = extractContext(optionalParams) ?? this.context;
    const payload = {
      message: formatMessage(message),
      context,
      stack: extractStack(message),
    };
    this.winston.log(level, payload);
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }
}

export function createApplicationLogger(): NestWinstonLogger {
  const config = resolveFileLoggerConfig();
  const logger = new NestWinstonLogger('Application');
  if (config.enabled) {
    logger.log(
      `File logging enabled: ${config.filePath} (max ${config.maxSizeBytes} bytes, keep ${config.maxFiles} rotations)`,
      'Bootstrap',
    );
  }
  return logger;
}
