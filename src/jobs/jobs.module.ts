import { Module } from '@nestjs/common';
import { CronModule } from './cron/cron.module';
import { QueueJobsModule } from './queues/queue-jobs.module';

@Module({
  imports: [CronModule, QueueJobsModule],
})
export class JobsModule {}
