import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CoreConfigModule } from './config/config.module';
import { PrismaRequestLifecycleInterceptor } from './database/prisma-request-lifecycle.interceptor';
import { PrismaModule } from './database/prisma.module';
import { HealthController } from './health/health.controller';
import { LoggerModule } from './logger/logger.module';
import { RootController } from './root.controller';

@Global()
@Module({
  imports: [CoreConfigModule, PrismaModule, LoggerModule],
  controllers: [RootController, HealthController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: PrismaRequestLifecycleInterceptor,
    },
  ],
  exports: [PrismaModule, LoggerModule],
})
export class CoreModule {}
