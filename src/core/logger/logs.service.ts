import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { resolveFileLoggerConfig } from './file-logger.config';
import { readTailLines } from './read-log-tail';

export type LogFileSummary = {
  name: string;
  path: string;
  sizeBytes: number;
  modifiedAt: string;
  active: boolean;
};

export type LogLinesResponse = {
  enabled: boolean;
  file: LogFileSummary | null;
  files: LogFileSummary[];
  lines: string[];
  lineCount: number;
  limit: number;
};

@Injectable()
export class LogsService {
  listLogFiles(): LogFileSummary[] {
    const config = resolveFileLoggerConfig();
    if (!config.enabled) {
      return [];
    }

    const dir = path.dirname(config.filePath);
    const base = path.basename(config.filePath);
    const names = new Set<string>([base]);

    if (existsSync(dir)) {
      for (const entry of readdirSync(dir)) {
        if (entry === base || entry.startsWith(`${base}.`)) {
          names.add(entry);
        }
      }
    }

    const files = [...names]
      .map((name) => this.describeLogFile(path.join(dir, name), name, base))
      .filter((row): row is LogFileSummary => row !== null)
      .sort((a, b) => {
        if (a.active !== b.active) {
          return a.active ? -1 : 1;
        }
        return b.modifiedAt.localeCompare(a.modifiedAt);
      });

    return files;
  }

  readLatestLines(limit: number, requestedFile?: string): LogLinesResponse {
    const config = resolveFileLoggerConfig();
    const files = this.listLogFiles();

    if (!config.enabled) {
      throw new ServiceUnavailableException(
        'File logging is disabled. Set LOG_FILE_ENABLED=true.',
      );
    }

    const base = path.basename(config.filePath);
    const fileName = requestedFile?.trim() || base;
    const dir = path.dirname(config.filePath);
    const resolvedPath = path.resolve(dir, fileName);
    const resolvedDir = path.resolve(dir);
    const relative = path.relative(resolvedDir, resolvedPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new NotFoundException(`Log file not found: ${fileName}`);
    }

    const target = files.find((f) => f.name === fileName);
    if (!target) {
      throw new NotFoundException(`Log file not found: ${fileName}`);
    }

    const lines = readTailLines(target.path, limit);

    return {
      enabled: true,
      file: target,
      files,
      lines,
      lineCount: lines.length,
      limit,
    };
  }

  private describeLogFile(
    filePath: string,
    name: string,
    activeBaseName: string,
  ): LogFileSummary | null {
    if (!existsSync(filePath)) {
      return null;
    }
    const stat = statSync(filePath);
    return {
      name,
      path: filePath,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      active: name === activeBaseName,
    };
  }
}
