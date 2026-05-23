import winston from 'winston';

import {
  ensureLogDirectory,
  resolveFileLoggerConfig,
  type FileLoggerConfig,
} from './file-logger.config';

function nestLikeFormat() {
  return winston.format.printf((info) => {
    const context =
      typeof info.context === 'string' && info.context.length > 0
        ? ` [${info.context}]`
        : '';
    const stack =
      typeof info.stack === 'string' && info.stack.length > 0
        ? `\n${info.stack}`
        : '';
    return `${info.timestamp} ${info.level.toUpperCase().padEnd(7)}${context} ${info.message}${stack}`;
  });
}

let sharedLogger: winston.Logger | null = null;

export function getSharedWinstonLogger(): winston.Logger {
  if (!sharedLogger) {
    sharedLogger = createWinstonLogger();
  }
  return sharedLogger;
}

export function createWinstonLogger(
  config: FileLoggerConfig = resolveFileLoggerConfig(),
): winston.Logger {
  const transports: winston.transport[] = [];

  if (config.enabled) {
    ensureLogDirectory(config.filePath);
    transports.push(
      new winston.transports.File({
        filename: config.filePath,
        level: config.level,
        maxsize: config.maxSizeBytes,
        maxFiles: config.maxFiles,
        tailable: true,
      }),
    );
  }

  if (config.console) {
    transports.push(
      new winston.transports.Console({
        level: config.level,
        format: winston.format.combine(
          winston.format.colorize({ all: true }),
          nestLikeFormat(),
        ),
      }),
    );
  }

  if (transports.length === 0) {
    transports.push(
      new winston.transports.Console({
        level: config.level,
        silent: true,
      }),
    );
  }

  return winston.createLogger({
    level: config.level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      nestLikeFormat(),
    ),
    transports,
  });
}
