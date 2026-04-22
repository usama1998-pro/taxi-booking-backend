import { Module } from '@nestjs/common';
import { ApifyModule } from './apify/apify.module';
import { OpenaiModule } from './openai/openai.module';
import { QueuesModule } from './queues/queues.module';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    RedisModule,
    QueuesModule,
    StorageModule,
    ApifyModule,
    OpenaiModule,
  ],
  exports: [
    RedisModule,
    QueuesModule,
    StorageModule,
    ApifyModule,
    OpenaiModule,
  ],
})
export class InfrastructureModule {}
