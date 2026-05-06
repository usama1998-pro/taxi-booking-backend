import { Global, Module } from '@nestjs/common';
import { CoreConfigModule } from './config/config.module';
import { PrismaModule } from './database/prisma.module';
import { HealthController } from './health/health.controller';
import { LoggerModule } from './logger/logger.module';
import { RootController } from './root.controller';

@Global()
@Module({
  imports: [CoreConfigModule, PrismaModule, LoggerModule],
  controllers: [RootController, HealthController],
  exports: [PrismaModule, LoggerModule],
})
export class CoreModule {}
