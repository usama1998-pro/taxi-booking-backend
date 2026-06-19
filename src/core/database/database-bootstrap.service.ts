import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import {
  ensureSuperAdminFromEnv,
  formatEnsureSuperAdminError,
  readSuperAdminBootstrapFromEnv,
} from './ensure-super-admin-from-env';

/**
 * One-time DB bootstrap on API startup.
 * Acquires a connection explicitly (no HTTP interceptor on module init).
 */
@Injectable()
export class DatabaseBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    let bootstrap;
    try {
      bootstrap = readSuperAdminBootstrapFromEnv();
    } catch (err) {
      this.logger.error(
        `Super admin bootstrap misconfigured: ${err instanceof Error ? err.message : err}`,
      );
      return;
    }

    if (!bootstrap) {
      return;
    }

    await this.prisma.acquireRequestConnection();
    try {
      const result = await ensureSuperAdminFromEnv(this.prisma, bootstrap);
      switch (result.status) {
        case 'skipped':
          break;
        case 'exists':
          this.logger.log(
            `Super admin already exists (${bootstrap.email}) — skipping create.`,
          );
          break;
        case 'promoted':
          this.logger.log(
            `Promoted existing staff user to super admin (${bootstrap.email}).`,
          );
          break;
        case 'created':
          this.logger.log(
            `Created super admin ${result.userId} (${bootstrap.email}).`,
          );
          break;
        case 'error':
          this.logger.error(`Super admin bootstrap failed: ${result.message}`);
          break;
      }
    } catch (err) {
      this.logger.error(
        `Super admin bootstrap failed: ${formatEnsureSuperAdminError(err)}`,
      );
    } finally {
      await this.prisma.releaseRequestConnection();
    }
  }
}
