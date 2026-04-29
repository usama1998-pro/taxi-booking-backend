import { Module } from '@nestjs/common';
import { QueuesModule } from './queues/queues.module';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [RedisModule, QueuesModule, StorageModule],
  exports: [RedisModule, QueuesModule, StorageModule],
})
export class InfrastructureModule {}
