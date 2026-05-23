import { Global, Module } from '@nestjs/common';

import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';
import { NestWinstonLogger } from './nest-winston.logger';

@Global()
@Module({
  controllers: [LogsController],
  providers: [NestWinstonLogger, LogsService],
  exports: [NestWinstonLogger, LogsService],
})
export class LoggerModule {}
