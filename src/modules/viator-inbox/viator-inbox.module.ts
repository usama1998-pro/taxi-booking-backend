import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { ViatorInboxController } from './viator-inbox.controller';
import { ViatorInboxPoller } from './viator-inbox.poller';
import { ViatorInboxService } from './viator-inbox.service';

@Module({
  imports: [BookingsModule],
  controllers: [ViatorInboxController],
  providers: [ViatorInboxService, ViatorInboxPoller],
  exports: [ViatorInboxService],
})
export class ViatorInboxModule {}
