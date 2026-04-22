import { Global, Module } from '@nestjs/common';
import { CoreConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { LoggerModule } from './logger/logger.module';
import { RootController } from './root.controller';

@Global()
@Module({
  imports: [CoreConfigModule, DatabaseModule, LoggerModule],
  controllers: [RootController],
  exports: [DatabaseModule, LoggerModule],
})
export class CoreModule {}
