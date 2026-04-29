import { Global, Module } from '@nestjs/common';
import { CoreConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { PrismaModule } from './database/prisma.module';
import { HealthController } from './health/health.controller';
import { LoggerModule } from './logger/logger.module';
import { RootController } from './root.controller';

@Global()
@Module({
  imports: [CoreConfigModule, DatabaseModule, PrismaModule, LoggerModule],
  controllers: [RootController, HealthController],
  exports: [DatabaseModule, PrismaModule, LoggerModule],
})
export class CoreModule {}
