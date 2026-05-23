import { Global, Module } from '@nestjs/common';

import { NestWinstonLogger } from './nest-winston.logger';

@Global()
@Module({
  providers: [NestWinstonLogger],
  exports: [NestWinstonLogger],
})
export class LoggerModule {}
